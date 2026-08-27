import { Box, Button, Group } from "@mantine/core";
import type { MetadataProgressUpdateInput } from "@ryot/generated/graphql/backend/graphql";
import {
	EntityTranslationVariant,
	SeenState,
} from "@ryot/generated/graphql/backend/graphql";
import { sum } from "@ryot/ts-utils";
import { useMemo } from "react";
import { useSubmit } from "react-router";
import { withQuery } from "ufo";
import {
	useDeployBulkMetadataProgressUpdateMutation,
	useMetadataDetails,
	useMetadataTranslationValue,
	useUserMetadataDetails,
} from "~/lib/shared/hooks";
import { refreshEntityDetails } from "~/lib/shared/react-query";
import { openConfirmationModal } from "~/lib/shared/ui-utils";
import { useMetadataProgressUpdate } from "~/lib/state/media";
import type { Season } from "../types";
import { DisplaySeasonOrEpisodeDetails } from "./season-episode-details";

export const getShowSeasonDisplayName = (season: Season, title: string) =>
	`${season.seasonNumber}. ${title}`;

export const DisplayShowSeason = (props: {
	season: Season;
	seasonIdx: number;
	metadataId: string;
	openSeasonModal: () => void;
}) => {
	const { data: userMetadataDetails } = useUserMetadataDetails(
		props.metadataId,
	);
	const { initializeMetadataToUpdate } = useMetadataProgressUpdate();
	const [{ data: metadataDetails }] = useMetadataDetails(props.metadataId);
	const deployBulkMetadataProgressUpdate =
		useDeployBulkMetadataProgressUpdateMutation(metadataDetails?.title);
	const rawSubmit = useSubmit();

	const seasonProgress = userMetadataDetails?.showProgress?.[props.seasonIdx];
	const numTimesSeen = seasonProgress?.timesSeen || 0;
	const isSeen = numTimesSeen > 0;
	const lastCompletedInSeason = userMetadataDetails?.history.find(
		(h) =>
			h.state === SeenState.Completed &&
			h.showExtraInformation?.season === props.season.seasonNumber,
	);
	const removeLastSeen = () => {
		if (!lastCompletedInSeason) return;
		openConfirmationModal(
			"Are you sure you want to remove the last watched episode of this season? This will decrease the times seen count by one.",
			() => {
				rawSubmit(
					{ seenId: lastCompletedInSeason.id },
					{
						method: "post",
						navigate: false,
						action: withQuery(".", { intent: "deleteSeenItem" }),
					},
				);
				refreshEntityDetails(props.metadataId);
			},
		);
	};
	const showExtraInformation = useMemo(
		() => ({ season: props.season.seasonNumber }),
		[props.season.seasonNumber],
	);
	const seasonTitleTranslation = useMetadataTranslationValue({
		metadataId: props.metadataId,
		showExtraInformation,
		variant: EntityTranslationVariant.Title,
	});
	const seasonDescriptionTranslation = useMetadataTranslationValue({
		metadataId: props.metadataId,
		showExtraInformation,
		variant: EntityTranslationVariant.Description,
	});

	return (
		<Box my={props.seasonIdx !== 0 ? "md" : undefined}>
			<DisplaySeasonOrEpisodeDetails
				{...props.season}
				displayIndicator={numTimesSeen}
				numEpisodes={props.season.episodes.length}
				onNameClick={() => props.openSeasonModal()}
				endDate={props.season.episodes.at(-1)?.publishDate}
				startDate={props.season.episodes.at(0)?.publishDate}
				overview={seasonDescriptionTranslation || props.season.overview}
				runtime={sum(props.season.episodes.map((e) => e.runtime || 0))}
				name={getShowSeasonDisplayName(
					props.season,
					seasonTitleTranslation || props.season.name,
				)}
			>
				{props.season.episodes.length > 0 ? (
					<Group gap="xs">
						<Button
							size="xs"
							color="blue"
							variant={isSeen ? "default" : "outline"}
							onClick={() => {
								initializeMetadataToUpdate({
									metadataId: props.metadataId,
									showSeasonNumber: props.season.seasonNumber,
									showEpisodeNumber: props.season.episodes.at(-1)?.episodeNumber,
								});
							}}
						>
							{isSeen ? "Watch again" : "Mark as seen"}
						</Button>
						{isSeen ? (
							<Button
								size="xs"
								color="blue"
								variant="outline"
								loading={deployBulkMetadataProgressUpdate.isPending}
								onClick={() => {
									const updates: MetadataProgressUpdateInput[] =
										props.season.episodes.map((episode) => ({
											metadataId: props.metadataId,
											change: {
												createNewCompleted: {
													withoutDates: {
														showSeasonNumber: props.season.seasonNumber,
														showEpisodeNumber: episode.episodeNumber,
													},
												},
											},
										}));
									deployBulkMetadataProgressUpdate.mutate(updates);
								}}
							>
								Rewatched
							</Button>
						) : null}
						{lastCompletedInSeason ? (
							<Button
								size="xs"
								color="red"
								variant="outline"
								onClick={removeLastSeen}
							>
								Remove last watch
							</Button>
						) : null}
					</Group>
				) : null}
			</DisplaySeasonOrEpisodeDetails>
		</Box>
	);
};
