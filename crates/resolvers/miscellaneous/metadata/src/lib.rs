use async_graphql::{Context, Object, Result};
use common_models::EntityWithLot;
use dependent_models::{
    CachedResponse, UserMetadataDetails, UserMetadataListInput, UserMetadataListResponse,
};
use enum_models::{MediaLot, MediaSource};
use media_models::{GraphqlMetadataDetails, PartialMetadataListItem};
use traits::GraphqlDependencyInjector;

#[derive(Default)]
pub struct MiscellaneousMetadataQueryResolver;

impl GraphqlDependencyInjector for MiscellaneousMetadataQueryResolver {}

#[Object]
impl MiscellaneousMetadataQueryResolver {
    /// Get details about a media present in the database.
    async fn metadata_details(
        &self,
        gql_ctx: &Context<'_>,
        metadata_id: String,
    ) -> Result<CachedResponse<GraphqlMetadataDetails>> {
        let service = self.dependency(gql_ctx);
        Ok(dependent_details_utils::metadata_details(service, &metadata_id).await?)
    }

    /// Get all the media items related to a user for a specific media type.
    async fn user_metadata_list(
        &self,
        gql_ctx: &Context<'_>,
        input: UserMetadataListInput,
    ) -> Result<CachedResponse<UserMetadataListResponse>> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(dependent_entity_list_utils::user_metadata_list(&user_id, input, service).await?)
    }

    /// Get details that can be displayed to a user for a media.
    async fn user_metadata_details(
        &self,
        gql_ctx: &Context<'_>,
        metadata_id: String,
    ) -> Result<CachedResponse<UserMetadataDetails>> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(
            miscellaneous_entity_user_details_service::user_metadata_details(
                service,
                user_id,
                metadata_id,
            )
            .await?,
        )
    }

    /// List metadata associated with the user that is still partial (unresolved).
    async fn partial_metadata_list(
        &self,
        gql_ctx: &Context<'_>,
    ) -> Result<Vec<PartialMetadataListItem>> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(
            miscellaneous_metadata_operations_service::partial_metadata_list(service, &user_id)
                .await?,
        )
    }

    /// Returns whether the current user has recently consumed the specified entity.
    async fn user_entity_recently_consumed(
        &self,
        gql_ctx: &Context<'_>,
        input: EntityWithLot,
    ) -> Result<bool> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(
            miscellaneous_entity_user_details_service::get_entity_recently_consumed(
                &user_id, input, service,
            )
            .await?,
        )
    }
}

#[derive(Default)]
pub struct MiscellaneousMetadataMutationResolver;

impl GraphqlDependencyInjector for MiscellaneousMetadataMutationResolver {
    fn is_mutation(&self) -> bool {
        true
    }
}

#[Object]
impl MiscellaneousMetadataMutationResolver {
    /// Merge a media item into another. This will move all `seen`, `collection`
    /// and `review` associations with to the metadata.
    async fn merge_metadata(
        &self,
        gql_ctx: &Context<'_>,
        merge_from: String,
        merge_into: String,
    ) -> Result<bool> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(miscellaneous_metadata_operations_service::merge_metadata(
            service, user_id, merge_from, merge_into,
        )
        .await?)
    }

    /// Delete all history and reviews for a given media item and remove it from all
    /// collections for the user.
    async fn disassociate_metadata(
        &self,
        gql_ctx: &Context<'_>,
        metadata_id: String,
    ) -> Result<bool> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(
            miscellaneous_metadata_operations_service::disassociate_metadata(
                service,
                user_id,
                metadata_id,
            )
            .await?,
        )
    }

    /// Mark an entity as partial.
    async fn mark_entity_as_partial(
        &self,
        gql_ctx: &Context<'_>,
        input: EntityWithLot,
    ) -> Result<bool> {
        let (service, _) = self.dependency_and_user(gql_ctx).await?;
        Ok(miscellaneous_general_service::mark_entity_as_partial(service, input).await?)
    }

    /// For a partial item sourced from TVDB, try resolving it to TMDB instead
    /// (more complete catalog) via TMDB's external-id lookup. Returns `true`
    /// only if a match was found and applied.
    async fn auto_reidentify_metadata_via_tmdb(
        &self,
        gql_ctx: &Context<'_>,
        metadata_id: String,
    ) -> Result<bool> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(
            miscellaneous_metadata_operations_service::auto_reidentify_metadata_via_tmdb(
                service,
                user_id,
                metadata_id,
            )
            .await?,
        )
    }

    /// Re-point a metadata item (typically partial/mis-identified) to a different
    /// provider identifier, fetch the correct details, and migrate this user's
    /// history/reviews/collections over to it.
    async fn reidentify_metadata(
        &self,
        gql_ctx: &Context<'_>,
        metadata_id: String,
        new_lot: MediaLot,
        new_source: MediaSource,
        new_identifier: String,
    ) -> Result<bool> {
        let (service, user_id) = self.dependency_and_user(gql_ctx).await?;
        Ok(
            miscellaneous_metadata_operations_service::reidentify_metadata(
                service,
                user_id,
                metadata_id,
                new_lot,
                new_source,
                new_identifier,
            )
            .await?,
        )
    }
}
