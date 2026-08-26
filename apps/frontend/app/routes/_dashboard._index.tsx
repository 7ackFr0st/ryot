import {
	ActionIcon,
	Alert,
	Anchor,
	Button,
	Container,
	Drawer,
	Group,
	Stack,
	Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
	type CalendarEventPartFragment,
	CollectionContentsDocument,
	type CollectionContentsInput,
	CollectionContentsSortBy,
	DailyUserActivitiesResponseGroupedBy,
	DashboardElementLot,
	GraphqlSortOrder,
	MinimalUserAnalyticsDocument,
	TrendingMetadataDocument,
	UserCurrentlyWatchingDocument,
	UserMetadataRecommendationsDocument,
	UserRecentlyWatchedHistoryDocument,
	type UserRecentlyWatchedHistoryQuery,
	type UserUpcomingCalendarEventInput,
	UserUpcomingCalendarEventsDocument,
} from "@ryot/generated/graphql/backend/graphql";
import { isNumber, parseSearchQuery, zodBoolAsString } from "@ryot/ts-utils";
import {
	IconInfoCircle,
	IconPlayerPlay,
	IconRotateClockwise,
} from "@tabler/icons-react";
import { skipToken, useQuery } from "@tanstack/react-query";
import CryptoJS from "crypto-js";
import { type ReactNode, useMemo } from "react";
import { Link, redirect } from "react-router";
import { ClientOnly } from "remix-utils/client-only";
import { $path } from "safe-routes";
import { match } from "ts-pattern";
import { useLocalStorage } from "usehooks-ts";
import { z } from "zod";
import {
	DisplayCollectionEntity,
	ProRequiredAlert,
	SkeletonLoader,
} from "~/components/common";
import { ApplicationGrid } from "~/components/common/layout";
import { DisplaySummarySection } from "~/components/common/summary";
import { MetadataDisplayItem } from "~/components/media/display-items";
import { dayjsLib } from "~/lib/shared/date-utils";
import {
	useCoreDetails,
	useExpireCacheKeyMutation,
	useIsMobile,
	useIsOnboardingTourCompleted,
	useUserCollections,
	useUserDetails,
	useUserPreferences,
} from "~/lib/shared/hooks";
import {
	clientGqlService,
	getMetadataDetailsQuery,
	queryFactory,
} from "~/lib/shared/react-query";
import { openConfirmationModal } from "~/lib/shared/ui-utils";
import { useOnboardingTour } from "~/lib/state/onboarding-tour";
import { getUserPreferences } from "~/lib/utilities.server";
import type { Route } from "./+types/_dashboard._index";

const searchParamsSchema = z.object({
	ignoreLandingPath: zodBoolAsString.optional(),
});

export type SearchParams = z.infer<typeof searchParamsSchema>;

export const loader = async ({ request }: Route.LoaderArgs) => {
	const preferences = await getUserPreferences(request);
	const query = parseSearchQuery(request, searchParamsSchema);
	const landingPath = preferences.general.landingPath;
	if (landingPath !== "/" && !query.ignoreLandingPath)
		throw redirect(landingPath);
	return {};
};

export const meta = () => {
	return [{ title: "Dashboard | Ryot" }];
};

export default function Page() {
	const isMobile = useIsMobile();
	const coreDetails = useCoreDetails();
	const userDetails = useUserDetails();
	const userCollections = useUserCollections();
	const userPreferences = useUserPreferences();
	const { startOnboardingTour } = useOnboardingTour();
	const isOnboardingTourCompleted = useIsOnboardingTourCompleted();

	const dashboardMessage = coreDetails.frontend.dashboardMessage;

	const [isAlertDismissed, setIsAlertDismissed] = useLocalStorage(
		`AlertDismissed-${userDetails.id}-${CryptoJS.SHA256(dashboardMessage)}`,
		"false",
	);

	const dbElm = (el: DashboardElementLot) =>
		userPreferences.general.dashboard.find((de) => de.section === el);

	const takeUpcoming = dbElm(DashboardElementLot.Upcoming)?.numElements;
	const takeInProgress = dbElm(DashboardElementLot.InProgress)?.numElements;
	const takeHistory = dbElm(DashboardElementLot.History)?.numElements || 10;
	const daysAheadUpcoming = dbElm(DashboardElementLot.Upcoming)?.numDaysAhead;

	const userCurrentlyWatchingQuery = useQuery({
		refetchInterval: 30_000,
		queryKey: queryFactory.miscellaneous.userCurrentlyWatching().queryKey,
		queryFn: () => clientGqlService.request(UserCurrentlyWatchingDocument),
	});

	const userRecentlyWatchedHistoryQuery = useQuery({
		queryKey:
			queryFactory.miscellaneous.userRecentlyWatchedHistory(takeHistory)
				.queryKey,
		queryFn: () =>
			clientGqlService.request(UserRecentlyWatchedHistoryDocument, {
				take: takeHistory,
			}),
	});

	const inProgressCollection = userCollections.find(
		(c) => c.name === "In Progress",
	);

	const collectionContentsInput: CollectionContentsInput = {
		search: { take: takeInProgress },
		collectionId: inProgressCollection?.id || "",
		sort: {
			order: GraphqlSortOrder.Desc,
			by: CollectionContentsSortBy.LastUpdatedOn,
		},
	};
	const inProgressCollectionContentsQuery = useQuery({
		queryKey: queryFactory.collections.collectionContents(
			collectionContentsInput,
		).queryKey,
		queryFn: inProgressCollection?.id
			? () =>
					clientGqlService.request(CollectionContentsDocument, {
						input: collectionContentsInput,
					})
			: skipToken,
	});

	const upcomingInput: UserUpcomingCalendarEventInput = takeUpcoming
		? { nextMedia: takeUpcoming }
		: daysAheadUpcoming
			? { nextDays: daysAheadUpcoming }
			: { nextMedia: 8 };
	const userUpcomingCalendarEventsQuery = useQuery({
		queryKey:
			queryFactory.calendar.userUpcomingCalendarEvents(upcomingInput).queryKey,
		queryFn: () =>
			clientGqlService.request(UserUpcomingCalendarEventsDocument, {
				input: upcomingInput,
			}),
	});

	const userAnalyticsQuery = useQuery({
		queryKey: queryFactory.miscellaneous.userAnalytics({
			dateRange: {},
			groupBy: DailyUserActivitiesResponseGroupedBy.AllTime,
		}).queryKey,
		queryFn: () =>
			clientGqlService.request(MinimalUserAnalyticsDocument, {
				input: {
					dateRange: {},
					groupBy: DailyUserActivitiesResponseGroupedBy.AllTime,
				},
			}),
	});

	const latestUserSummary =
		userAnalyticsQuery.data?.userAnalytics.response.activities.items.at(0);

	return (
		<Container>
			<Stack gap={32}>
				<ClientOnly>
					{() => (
						<>
							{dashboardMessage && isAlertDismissed === "false" ? (
								<Alert
									withCloseButton
									variant="default"
									icon={<IconInfoCircle />}
									onClose={() => setIsAlertDismissed("true")}
								>
									{dashboardMessage}
								</Alert>
							) : null}
							{!isOnboardingTourCompleted && !isMobile ? (
								<Alert
									variant="filled"
									icon={<IconPlayerPlay />}
									style={{ cursor: "pointer" }}
									onClick={startOnboardingTour}
								>
									Welcome to Ryot! Click here to start your onboarding tour.
								</Alert>
							) : null}
						</>
					)}
				</ClientOnly>
				{userCurrentlyWatchingQuery.data?.userCurrentlyWatching ? (
					<Stack gap="sm" id="now-watching">
						<SectionTitle text="Currently Watching" />
						<ApplicationGrid>
							<MetadataDisplayItem
								metadataId={
									userCurrentlyWatchingQuery.data.userCurrentlyWatching
										.metadataId
								}
								additionalInformation={
									isNumber(
										userCurrentlyWatchingQuery.data.userCurrentlyWatching
											.showSeasonNumber,
									) &&
									isNumber(
										userCurrentlyWatchingQuery.data.userCurrentlyWatching
											.showEpisodeNumber,
									)
										? `S${userCurrentlyWatchingQuery.data.userCurrentlyWatching.showSeasonNumber}-E${userCurrentlyWatchingQuery.data.userCurrentlyWatching.showEpisodeNumber}`
										: undefined
								}
							/>
						</ApplicationGrid>
					</Stack>
				) : null}
				{userPreferences.general.dashboard.map((de) =>
					match([de.section, de.hidden])
						.with([DashboardElementLot.Upcoming, false], ([v, _]) => (
							<Section key={v} lot={v}>
								<SectionTitle text="Upcoming" />
								{userUpcomingCalendarEventsQuery.data ? (
									userUpcomingCalendarEventsQuery.data
										.userUpcomingCalendarEvents.length > 0 ? (
										<ApplicationGrid>
											{userUpcomingCalendarEventsQuery.data.userUpcomingCalendarEvents.map(
												(um) => (
													<UpcomingMediaSection
														um={um}
														key={um.calendarEventId}
													/>
												),
											)}
										</ApplicationGrid>
									) : (
										<Text c="dimmed">No upcoming media.</Text>
									)
								) : (
									<SkeletonLoader />
								)}
							</Section>
						))
						.with([DashboardElementLot.InProgress, false], ([v, _]) => (
							<Section key={v} lot={v}>
								<SectionTitle text="In Progress" />
								{inProgressCollectionContentsQuery.data ? (
									inProgressCollectionContentsQuery.data.collectionContents
										.response.results.items.length > 0 ? (
										<ApplicationGrid>
											{inProgressCollectionContentsQuery.data.collectionContents.response.results.items.map(
												(lm) => (
													<DisplayCollectionEntity
														key={lm.entityId}
														entityId={lm.entityId}
														entityLot={lm.entityLot}
													/>
												),
											)}
										</ApplicationGrid>
									) : (
										<Text c="dimmed">No media in progress.</Text>
									)
								) : (
									<SkeletonLoader />
								)}
							</Section>
						))
						.with([DashboardElementLot.Recommendations, false], ([v, _]) => (
							<Section key={v} lot={v}>
								<RecommendationsSection />
							</Section>
						))
						.with([DashboardElementLot.History, false], ([v, _]) => (
							<Section key={v} lot={v}>
								<SectionTitle text="History" />
								{userRecentlyWatchedHistoryQuery.data ? (
									userRecentlyWatchedHistoryQuery.data
										.userRecentlyWatchedHistory.length > 0 ? (
										<Stack gap={4}>
											{userRecentlyWatchedHistoryQuery.data.userRecentlyWatchedHistory.map(
												(item) => (
													<HistoryItemRow key={item.seenId} item={item} />
												),
											)}
										</Stack>
									) : (
										<Text c="dimmed">No history yet.</Text>
									)
								) : (
									<SkeletonLoader />
								)}
							</Section>
						))
						.with([DashboardElementLot.Summary, false], ([v, _]) => (
							<Section key={v} lot={v}>
								<SectionTitle text="Summary" />
								{userAnalyticsQuery.data ? (
									latestUserSummary ? (
										<DisplaySummarySection
											latestUserSummary={latestUserSummary}
										/>
									) : (
										<Text c="dimmed">
											No summary available. Please add some media to your
											watched history.
										</Text>
									)
								) : (
									<SkeletonLoader />
								)}
							</Section>
						))
						.with([DashboardElementLot.Trending, false], ([v, _]) => (
							<Section key={v} lot={v}>
								<TrendingSection />
							</Section>
						))
						.otherwise(() => undefined),
				)}
			</Stack>
		</Container>
	);
}

const RecommendationsSection = () => {
	const coreDetails = useCoreDetails();

	const { data, refetch, isFetching } = useQuery({
		queryKey: queryFactory.media.userMetadataRecommendations().queryKey,
		queryFn: () =>
			clientGqlService.request(UserMetadataRecommendationsDocument),
	});
	const expireCacheKey = useExpireCacheKeyMutation();

	return (
		<>
			<Group justify="space-between">
				<SectionTitle text="Recommendations" />
				{data ? (
					<ActionIcon
						variant="subtle"
						loading={isFetching}
						onClick={() => {
							openConfirmationModal(
								"Are you sure you want to refresh the recommendations?",
								async () => {
									await expireCacheKey.mutateAsync(
										data.userMetadataRecommendations.cacheId,
									);
									refetch();
								},
							);
						}}
					>
						<IconRotateClockwise />
					</ActionIcon>
				) : null}
			</Group>
			{data ? (
				coreDetails.isServerKeyValidated ? (
					data.userMetadataRecommendations.response.length > 0 ? (
						<ApplicationGrid>
							{data.userMetadataRecommendations.response.map((lm) => (
								<MetadataDisplayItem
									key={lm}
									metadataId={lm}
									shouldHighlightNameIfInteracted
								/>
							))}
						</ApplicationGrid>
					) : (
						<Text c="dimmed">No recommendations available.</Text>
					)
				) : (
					<ProRequiredAlert tooltipLabel="Get new recommendations every hour" />
				)
			) : (
				<SkeletonLoader />
			)}
		</>
	);
};

const TrendingSection = () => {
	const userPreferences = useUserPreferences();

	const [isTrendingMetadataListOpen, { toggle: toggleTrendingMetadataList }] =
		useDisclosure(false);

	const trendingMetadata = useQuery({
		queryKey: queryFactory.media.trendingMetadata().queryKey,
		queryFn: () => clientGqlService.request(TrendingMetadataDocument),
	});

	const trendingMetadataSelection =
		trendingMetadata.data?.trendingMetadata.slice(
			0,
			userPreferences.general.dashboard.find(
				(de) => de.section === DashboardElementLot.Trending,
			)?.numElements || 1,
		);

	return (
		<>
			<Drawer
				size="xl"
				position="right"
				title="Trending Media"
				opened={isTrendingMetadataListOpen}
				onClose={toggleTrendingMetadataList}
			>
				{trendingMetadata.data ? (
					<ApplicationGrid>
						{trendingMetadata.data.trendingMetadata.map((lm) => (
							<MetadataDisplayItem
								key={lm}
								metadataId={lm}
								shouldHighlightNameIfInteracted
							/>
						))}
					</ApplicationGrid>
				) : (
					<SkeletonLoader />
				)}
			</Drawer>
			<Group justify="space-between">
				<SectionTitle text="Trending" />
				{trendingMetadata.data &&
				trendingMetadataSelection &&
				trendingMetadata.data.trendingMetadata.length >
					trendingMetadataSelection.length ? (
					<Button
						size="xs"
						variant="subtle"
						onClick={toggleTrendingMetadataList}
					>
						View All
					</Button>
				) : null}
			</Group>
			{trendingMetadataSelection ? (
				trendingMetadataSelection.length > 0 ? (
					<ApplicationGrid>
						{trendingMetadataSelection.map((lm) => (
							<MetadataDisplayItem
								key={lm}
								metadataId={lm}
								shouldHighlightNameIfInteracted
							/>
						))}
					</ApplicationGrid>
				) : (
					<Text c="dimmed">No trending media available.</Text>
				)
			) : (
				<SkeletonLoader />
			)}
		</>
	);
};

const SectionTitle = (props: { text: string }) => (
	<Text fz={{ base: "h2", md: "h1" }} fw="bold">
		{props.text}
	</Text>
);

const HistoryItemRow = (props: {
	item: UserRecentlyWatchedHistoryQuery["userRecentlyWatchedHistory"][number];
}) => {
	const { data: metadataDetails } = useQuery(
		getMetadataDetailsQuery(props.item.metadataId),
	);

	const extraInformation = isNumber(props.item.showSeasonNumber)
		? `S${props.item.showSeasonNumber}E${props.item.showEpisodeNumber}`
		: isNumber(props.item.podcastEpisodeNumber)
			? `EP${props.item.podcastEpisodeNumber}`
			: undefined;

	return (
		<Anchor
			component={Link}
			c="inherit"
			underline="hover"
			to={$path("/media/item/:id", { id: props.item.metadataId })}
		>
			<Text size="sm" truncate>
				{metadataDetails?.title || "Loading..."}
				{extraInformation ? ` ${extraInformation}` : null}
			</Text>
		</Anchor>
	);
};

const UpcomingMediaSection = (props: { um: CalendarEventPartFragment }) => {
	const today = dayjsLib().startOf("day");
	const numDaysLeft = dayjsLib(props.um.date).diff(today, "day");

	const extraInformation = useMemo(() => {
		if (props.um.showExtraInformation)
			return `S${props.um.showExtraInformation.season}-E${props.um.showExtraInformation.episode}`;
		if (props.um.podcastExtraInformation)
			return `EP-${props.um.podcastExtraInformation.episode}`;
	}, [props.um]);

	const daysInformation = useMemo(() => {
		return numDaysLeft === 0
			? "Today"
			: `In ${numDaysLeft === 1 ? "a" : numDaysLeft} day${
					numDaysLeft === 1 ? "" : "s"
				}`;
	}, [numDaysLeft]);

	return (
		<MetadataDisplayItem
			metadataId={props.um.metadataId}
			additionalInformation={
				extraInformation
					? `${extraInformation} ${daysInformation}`
					: daysInformation
			}
		/>
	);
};

const Section = (props: {
	lot: DashboardElementLot;
	children: ReactNode | Array<ReactNode>;
}) => (
	<Stack gap="sm" id={props.lot}>
		{props.children}
	</Stack>
);
