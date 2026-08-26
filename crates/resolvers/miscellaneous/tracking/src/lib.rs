use async_graphql::{Context, Object, Result};
use common_models::StringIdObject;
use dependent_models::{UserCurrentlyWatchingResponse, UserRecentlyWatchedHistoryItem};
use media_models::{
    GraphqlCalendarEvent, GroupedCalendarEvent, MetadataProgressUpdateInput, UpdateSeenItemInput,
    UserCalendarEventInput, UserUpcomingCalendarEventInput,
};
use traits::GraphqlDependencyInjector;

#[derive(Default)]
pub struct MiscellaneousTrackingQueryResolver;

impl GraphqlDependencyInjector for MiscellaneousTrackingQueryResolver {}

#[Object]
impl MiscellaneousTrackingQueryResolver {
    /// Get calendar events for a user between a given date range.
    async fn user_calendar_events(
        &self,
        gql_ctx: &Context<'_>,
        input: UserCalendarEventInput,
    ) -> Result<Vec<GroupedCalendarEvent>> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(miscellaneous_calendar_service::user_calendar_events(user_id, input, service).await?)
    }

    /// Get upcoming calendar events for the given filter.
    async fn user_upcoming_calendar_events(
        &self,
        gql_ctx: &Context<'_>,
        input: UserUpcomingCalendarEventInput,
    ) -> Result<Vec<GraphqlCalendarEvent>> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(
            miscellaneous_calendar_service::user_upcoming_calendar_events(service, user_id, input)
                .await?,
        )
    }

    /// Get the media item the user is currently watching, if any, based on
    /// real-time Play/Pause/Stop events received from integration webhooks.
    async fn user_currently_watching(
        &self,
        gql_ctx: &Context<'_>,
    ) -> Result<Option<UserCurrentlyWatchingResponse>> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(dependent_seen_utils::user_currently_watching(&user_id, service).await?)
    }

    /// Get the most recently completed seen items for a user, across all media types.
    async fn user_recently_watched_history(
        &self,
        gql_ctx: &Context<'_>,
        take: u64,
    ) -> Result<Vec<UserRecentlyWatchedHistoryItem>> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(dependent_seen_utils::user_recently_watched_history(&user_id, service, take).await?)
    }
}

#[derive(Default)]
pub struct MiscellaneousTrackingMutationResolver;

impl GraphqlDependencyInjector for MiscellaneousTrackingMutationResolver {
    fn is_mutation(&self) -> bool {
        true
    }
}

#[Object]
impl MiscellaneousTrackingMutationResolver {
    /// Delete a seen item from a user's history.
    async fn delete_seen_item(
        &self,
        gql_ctx: &Context<'_>,
        seen_id: String,
    ) -> Result<StringIdObject> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(miscellaneous_progress_service::delete_seen_item(service, &user_id, seen_id).await?)
    }

    /// Update the attributes of a seen item.
    async fn update_seen_item(
        &self,
        gql_ctx: &Context<'_>,
        input: UpdateSeenItemInput,
    ) -> Result<bool> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(miscellaneous_progress_service::update_seen_item(service, &user_id, input).await?)
    }

    /// Deploy job to update progress of media items in bulk. For seen items in progress,
    /// progress is updated only if it has actually changed.
    async fn deploy_bulk_metadata_progress_update(
        &self,
        gql_ctx: &Context<'_>,
        input: Vec<MetadataProgressUpdateInput>,
    ) -> Result<bool> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(
            miscellaneous_service::deploy_bulk_metadata_progress_update(service, user_id, input)
                .await?,
        )
    }
}
