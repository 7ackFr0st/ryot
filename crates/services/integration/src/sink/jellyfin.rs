use std::sync::Arc;

use anyhow::{Result, anyhow};
use common_models::UserLevelCacheKey;
use common_utils::ryot_log;
use database_models::{metadata, prelude::Metadata};
use dependent_models::{
    ApplicationCacheKey, ApplicationCacheKeyDiscriminants, ApplicationCacheValue,
    ExpireCacheKeyInput, ImportCompletedItem, ImportOrExportMetadataItem, ImportResult,
    UserCurrentlyWatchingCacheValue,
};
use enum_models::{MediaLot, MediaSource};
use media_models::ImportOrExportMetadataItemSeen;
use rust_decimal::{Decimal, dec};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};
use supporting_service::SupportingService;
use traits::TraceOk;

mod models {
    use super::*;

    #[derive(Serialize, Deserialize, Debug, Clone)]
    #[serde(rename_all = "PascalCase")]
    pub struct JellyfinWebhookSessionPlayStatePayload {
        pub position_ticks: Option<Decimal>,
    }
    #[derive(Serialize, Deserialize, Debug, Clone)]
    #[serde(rename_all = "PascalCase")]
    pub struct JellyfinWebhookSessionPayload {
        pub play_state: JellyfinWebhookSessionPlayStatePayload,
    }
    #[derive(Serialize, Deserialize, Debug, Clone)]
    #[serde(rename_all = "PascalCase")]
    pub struct JellyfinWebhookItemProviderIdsPayload {
        pub tmdb: Option<String>,
        pub tvdb: Option<String>,
    }
    #[derive(Serialize, Deserialize, Debug, Clone)]
    #[serde(rename_all = "PascalCase")]
    pub struct JellyfinWebhookItemPayload {
        #[serde(rename = "Type")]
        pub item_type: String,
        #[serde(rename = "ParentIndexNumber")]
        pub season_number: Option<i32>,
        #[serde(rename = "IndexNumber")]
        pub episode_number: Option<i32>,
        pub run_time_ticks: Option<Decimal>,
        pub provider_ids: JellyfinWebhookItemProviderIdsPayload,
    }
    #[derive(Serialize, Deserialize, Debug, Clone)]
    #[serde(rename_all = "PascalCase")]
    pub struct JellyfinWebhookUserPayload {
        pub name: Option<String>,
    }
    #[derive(Serialize, Deserialize, Debug, Clone)]
    #[serde(rename_all = "PascalCase")]
    pub struct JellyfinWebhookPayload {
        pub event: Option<String>,
        pub item: JellyfinWebhookItemPayload,
        pub user: Option<JellyfinWebhookUserPayload>,
        pub series: Option<JellyfinWebhookItemPayload>,
        pub session: Option<JellyfinWebhookSessionPayload>,
    }
}

pub async fn sink_progress(
    payload: String,
    jellyfin_sink_username: Option<String>,
    jellyfin_sink_metadata_provider: Option<String>,
    user_id: &str,
    ss: &Arc<SupportingService>,
) -> Result<Option<ImportResult>> {
    let payload = serde_json::from_str::<models::JellyfinWebhookPayload>(&payload)?;
    ryot_log!(debug, "Jellyfin webhook event: {:?}", payload.event);
    if let Some(jellyfin_sink_username) = jellyfin_sink_username
        && payload.user.as_ref().and_then(|u| u.name.as_ref()) != Some(&jellyfin_sink_username)
    {
        return Ok(None);
    }
    let use_tvdb = jellyfin_sink_metadata_provider.as_deref() == Some("tvdb");
    let (identifier, source) = match use_tvdb {
        true => {
            let id = payload
                .series
                .as_ref()
                .and_then(|s| s.provider_ids.tvdb.as_ref())
                .or(payload.item.provider_ids.tvdb.as_ref())
                .ok_or_else(|| anyhow!("No TVDB ID associated with this media"))?
                .clone();
            (id, MediaSource::Tvdb)
        }
        false => {
            let id = payload
                .item
                .provider_ids
                .tmdb
                .as_ref()
                .or_else(|| {
                    payload
                        .series
                        .as_ref()
                        .and_then(|s| s.provider_ids.tmdb.as_ref())
                })
                .ok_or_else(|| anyhow!("No TMDb ID associated with this media"))?
                .clone();
            (id, MediaSource::Tmdb)
        }
    };

    let lot = match payload.item.item_type.as_str() {
        "Movie" => MediaLot::Movie,
        "Episode" => MediaLot::Show,
        _ => return Ok(None),
    };

    update_currently_watching(
        user_id,
        ss,
        payload.event.as_deref(),
        &identifier,
        source,
        lot,
        payload.item.season_number,
        payload.item.episode_number,
    )
    .await
    .trace_ok();

    let mut seen_item = ImportOrExportMetadataItemSeen {
        show_season_number: payload.item.season_number,
        show_episode_number: payload.item.episode_number,
        providers_consumed_on: Some(vec!["Jellyfin".to_string()]),
        ..Default::default()
    };

    // DEV: MarkPlayed has no real playback session (position ticks are absent
    // or meaningless), so treat it as an instant 100% instead of doing the
    // position/runtime math below.
    if payload.event.as_deref() == Some("MarkPlayed") {
        seen_item.progress = Some(dec!(100));
    } else {
        let runtime = payload
            .item
            .run_time_ticks
            .ok_or_else(|| anyhow!("No run time associated with this media"))?;

        let position = payload
            .session
            .as_ref()
            .and_then(|s| s.play_state.position_ticks.as_ref())
            .ok_or_else(|| anyhow!("No position associated with this media"))?;

        seen_item.progress = Some(position / runtime * dec!(100));
    }

    let result = ImportResult {
        completed: vec![ImportCompletedItem::Metadata(ImportOrExportMetadataItem {
            lot,
            source,
            identifier,
            seen_history: vec![seen_item],
            ..Default::default()
        })],
        ..Default::default()
    };

    Ok(Some(result))
}

/// Sets the "currently watching" cache entry on Play/Resume/Progress events
/// and clears it on Pause/Stop, using the event names sent by the
/// shemanaev/jellyfin-plugin-webhooks plugin (Play, Pause, Resume, Stop,
/// Progress). Unrecognized/missing event values are left untouched rather
/// than guessed at.
#[allow(clippy::too_many_arguments)]
async fn update_currently_watching(
    user_id: &str,
    ss: &Arc<SupportingService>,
    event: Option<&str>,
    identifier: &str,
    source: MediaSource,
    lot: MediaLot,
    show_season_number: Option<i32>,
    show_episode_number: Option<i32>,
) -> Result<()> {
    let key = ApplicationCacheKey::UserCurrentlyWatching(UserLevelCacheKey {
        input: (),
        user_id: user_id.to_owned(),
    });
    match event {
        Some("Play") | Some("Resume") | Some("Progress") => {
            let Some(metadata) = Metadata::find()
                .filter(metadata::Column::Identifier.eq(identifier))
                .filter(metadata::Column::Lot.eq(lot))
                .filter(metadata::Column::Source.eq(source))
                .one(&ss.db)
                .await?
            else {
                return Ok(());
            };
            cache_service::set_key(
                ss,
                key,
                ApplicationCacheValue::UserCurrentlyWatching(UserCurrentlyWatchingCacheValue {
                    metadata_id: metadata.id,
                    show_season_number,
                    show_episode_number,
                }),
            )
            .await?;
        }
        Some("Pause") | Some("Stop") => {
            cache_service::expire_key(
                ss,
                ExpireCacheKeyInput::BySanitizedKey {
                    user_id: Some(user_id.to_owned()),
                    key: ApplicationCacheKeyDiscriminants::UserCurrentlyWatching,
                },
            )
            .await?;
        }
        _ => {}
    }
    Ok(())
}
