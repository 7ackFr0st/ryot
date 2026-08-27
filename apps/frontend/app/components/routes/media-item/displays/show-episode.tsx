import { Box, Button, Group } from "@mantine/core";
import {
	EntityTranslationVariant,
	SeenState,
} from "@ryot/generated/graphql/backend/graphql";
import { useMemo } from "react";
import { useSubmit } from "react-router";
import { withQuery } from "ufo";
import {
	useMetadataTranslationValue,
	useUserMetadataDetails,
} from "~/lib/shared/hooks";
import { refreshEntityDetails } from "~/lib/shared/react-query";
import { openConfirmationModal } from "~/lib/shared/ui-utils";
import { useMetadataProgressUpdate } from "~/lib/state/media";
import type { Season, SeasonProgress } from "../types";
import { DisplaySeasonOrEpisodeDetails } from "./season-episode-details";

export const DisplayShowEpisode = (props: {
	seasonIdx: number;
	episodeIdx: number;
	metadataId: string;
	seasonNumber: number;
	episode: Season["episodes"][number];
	episodeProgress?: SeasonProgress["episodes"][number];
}) => {
	const { initializeMetadataToUpdate } = useMetadataProgressUpdate();
	const { data: userMetadataDetails } = useUserMetadataDetails(
		props.metadataId,
	);
	const rawSubmit = useSubmit();
	const numTimesEpisodeSeen = props.episodeProgress?.timesSeen || 0;
	const lastCompletedForEpisode = userMetadataDetails?.history.find(
		(h) =>
			h.state === SeenState.Completed &&
			h.showExtraInformation?.season === props.seasonNumber &&
			h.showExtraInformation?.episode === props.episode.episodeNumber,
	);
	const removeLastSeen = () => {
		if (!lastCompletedForEpisode) return;
		openConfirmationModal(
			"Are you sure you want to remove the last watch of this episode? This will decrease the times seen count by one.",
			() => {
				rawSubmit(
					{ seenId: lastCompletedForEpisode.id },
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
		() => ({
			season: props.seasonNumber,
			episode: props.episode.episodeNumber,
		}),
		[props.seasonNumber, props.episode.episodeNumber],
	);
	const episodeTitleTranslation = useMetadataTranslationValue({
		metadataId: props.metadataId,
		showExtraInformation,
		variant: EntityTranslationVariant.Title,
	});
	const episodeDescriptionTranslation = useMetadataTranslationValue({
		metadataId: props.metadataId,
		showExtraInformation,
		variant: EntityTranslationVariant.Description,
	});
	const episodeName = `${props.episode.episodeNumber}. ${
		episodeTitleTranslation ?? props.episode.name
	}`;

	return (
		<Box my="lg" ml="md">
			<DisplaySeasonOrEpisodeDetails
				{...props.episode}
				name={episodeName}
				key={props.episode.episodeNumber}
				displayIndicator={numTimesEpisodeSeen}
				publishDate={props.episode.publishDate}
				overview={episodeDescriptionTranslation ?? props.episode.overview}
			>
				<Group gap="xs">
					<Button
						size="xs"
						color="blue"
						variant={numTimesEpisodeSeen > 0 ? "default" : "outline"}
						onClick={() => {
							initializeMetadataToUpdate({
								metadataId: props.metadataId,
								showSeasonNumber: props.seasonNumber,
								showEpisodeNumber: props.episode.episodeNumber,
							});
						}}
					>
						{numTimesEpisodeSeen > 0 ? "Rewatch this" : "Mark as seen"}
					</Button>
					{lastCompletedForEpisode ? (
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
			</DisplaySeasonOrEpisodeDetails>
		</Box>
	);
};
