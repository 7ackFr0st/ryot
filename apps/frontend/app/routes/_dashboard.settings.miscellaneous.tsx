import {
	ActionIcon,
	Box,
	Button,
	Container,
	Group,
	Paper,
	Progress,
	SimpleGrid,
	Stack,
	Text,
	Title,
	useMantineTheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
	AutoReidentifyMetadataViaTmdbDocument,
	BackgroundJob,
	DeployBackgroundJobDocument,
	GenerateLogDownloadUrlDocument,
	MediaSource,
	PartialMetadataListDocument,
	type PartialMetadataListItem,
	ReidentifyMetadataDocument,
	UserLot,
} from "@ryot/generated/graphql/backend/graphql";
import { processSubmission } from "@ryot/ts-utils";
import {
	IconActivity,
	IconBarbell,
	IconChartBar,
	IconCloudDownload,
	IconDownload,
	IconPlayerPlay,
	IconRefresh,
	IconRocket,
	IconSearch,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useState } from "react";
import { data, Form, useNavigate } from "react-router";
import { ClientOnly } from "remix-utils/client-only";
import { match } from "ts-pattern";
import { z } from "zod";
import { ReidentifyMetadataModal } from "~/components/media/reidentify-metadata-modal";
import {
	useConfirmSubmit,
	useDashboardLayoutData,
	useInvalidateUserDetails,
	useIsMobile,
	useIsOnboardingTourCompleted,
	useMarkUserOnboardingTourStatus,
	useUserDetails,
} from "~/lib/shared/hooks";
import { clientGqlService } from "~/lib/shared/react-query";
import { openConfirmationModal, triggerDownload } from "~/lib/shared/ui-utils";
import { useOnboardingTour } from "~/lib/state/onboarding-tour";
import { createToastHeaders, serverGqlService } from "~/lib/utilities.server";
import type { Route } from "./+types/_dashboard.settings.miscellaneous";

export const meta = () => {
	return [{ title: "Miscellaneous settings | Ryot" }];
};

export const action = async ({ request }: Route.ActionArgs) => {
	const formData = await request.clone().formData();
	const submission = processSubmission(formData, jobSchema);
	await serverGqlService.authenticatedRequest(
		request,
		DeployBackgroundJobDocument,
		submission,
	);
	return data({} as const, {
		headers: await createToastHeaders({
			type: "success",
			message: "Job has been deployed",
		}),
	});
};

const jobSchema = z.object({
	jobName: z.enum(BackgroundJob),
});

export default function Page() {
	const navigate = useNavigate();
	const isMobile = useIsMobile();
	const { startOnboardingTour } = useOnboardingTour();
	const isOnboardingTourCompleted = useIsOnboardingTourCompleted();
	const markUserOnboardingStatus = useMarkUserOnboardingTourStatus();

	return (
		<Container size="lg">
			<Stack>
				<Title>Miscellaneous settings</Title>
				<SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
					{Object.values(BackgroundJob).map((job) => (
						<DisplayJobBtn key={job} job={job} />
					))}
					<DownloadLogsButton />
					<PartialMetadataCard />
					<ClientOnly>
						{() =>
							isOnboardingTourCompleted && !isMobile ? (
								<SettingsActionCard
									title="Onboarding"
									buttonText="Restart onboarding"
									icon={<IconRocket size={28} />}
									description="Restart the application onboarding tour."
									buttonProps={{
										onClick: async () => {
											await startOnboardingTour();
											await markUserOnboardingStatus.mutateAsync(false);
											navigate("/");
										},
									}}
								/>
							) : null
						}
					</ClientOnly>
				</SimpleGrid>
			</Stack>
		</Container>
	);
}

const SettingsActionCard = (props: {
	title: string;
	icon: ReactNode;
	buttonText: string;
	description: string;
	buttonProps?: ComponentPropsWithoutRef<typeof Button>;
}) => {
	const theme = useMantineTheme();

	return (
		<Paper
			withBorder
			radius="md"
			p={{ base: "sm", md: "lg" }}
			style={{
				height: "100%",
				display: "flex",
				flexDirection: "column",
				transition: "transform 0.2s, box-shadow 0.2s",
			}}
		>
			<Stack gap="md" style={{ flex: 1 }}>
				<Group gap="md" wrap="nowrap">
					<ActionIcon
						size={56}
						radius="md"
						variant="light"
						style={{ flexShrink: 0 }}
						color={theme.primaryColor}
					>
						{props.icon}
					</ActionIcon>
					<Box style={{ flex: 1, minWidth: 0 }}>
						<Title order={4} lineClamp={2}>
							{props.title}
						</Title>
					</Box>
				</Group>
				<Text size="sm" c="dimmed" style={{ flex: 1 }}>
					{props.description}
				</Text>
				<Button fullWidth variant="light" {...props.buttonProps}>
					{props.buttonText}
				</Button>
			</Stack>
		</Paper>
	);
};

const getJobDetails = (job: BackgroundJob) =>
	match(job)
		.with(
			BackgroundJob.UpdateAllMetadata,
			() =>
				[
					<IconRefresh size={28} key={job} />,
					"Update all metadata",
					"Mark all stored media items as partial so they will be automatically updated in the background the next time you view them.",
					true,
				] as const,
		)
		.with(
			BackgroundJob.UpdateAllExercises,
			() =>
				[
					<IconBarbell size={28} key={job} />,
					"Update all exercises",
					"Update the exercise database. Exercise data is downloaded on startup but they can be updated manually. Trigger this job when there are new exercises available.",
					true,
				] as const,
		)
		.with(
			BackgroundJob.PerformBackgroundTasks,
			() =>
				[
					<IconPlayerPlay size={28} key={job} />,
					"Perform background tasks",
					"Update the user summaries, recalculate media associations for all users, update all monitored entities and remove useless data. The more users you have, the longer this will take.",
					true,
				] as const,
		)
		.with(
			BackgroundJob.RecalculateUserActivitiesAndSummary,
			() =>
				[
					<IconChartBar size={28} key={job} />,
					"Regenerate Summaries",
					"Regenerate all pre-computed summaries from the beginning. This may be useful if, for some reason, summaries are faulty or preconditions have changed. This may take some time.",
				] as const,
		)
		.with(
			BackgroundJob.ReviseUserWorkouts,
			() =>
				[
					<IconActivity size={28} key={job} />,
					"Revise workouts",
					"Revise all workouts. This may be useful if exercises done during a workout have changed or workouts have been edited or deleted.",
				] as const,
		)
		.with(
			BackgroundJob.SyncIntegrationsData,
			() =>
				[
					<IconCloudDownload size={28} key={job} />,
					"Synchronize integrations progress",
					"Get/push data for all configured integrations and update progress if applicable. The more integrations you have enabled, the longer this will take.",
				] as const,
		)
		.exhaustive();

const DisplayJobBtn = (props: { job: BackgroundJob }) => {
	const submit = useConfirmSubmit();
	const userDetails = useUserDetails();
	const dashboardData = useDashboardLayoutData();
	const isEditDisabled = dashboardData.isDemoInstance;
	const invalidateUserDetails = useInvalidateUserDetails();

	const jobDetails = getJobDetails(props.job);
	const [icon, title, description, isAdminOnly] = jobDetails;

	if (isAdminOnly && userDetails.lot !== UserLot.Admin) return null;

	return (
		<Form replace method="POST">
			<input hidden name="jobName" defaultValue={props.job} />
			<SettingsActionCard
				icon={icon}
				title={title}
				buttonText={title}
				description={description}
				buttonProps={{
					type: "submit",
					disabled: isEditDisabled,
					onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
						const form = e.currentTarget.form;
						e.preventDefault();
						openConfirmationModal(
							"Are you sure you want to perform this task?",
							async () => {
								submit(form);
								await invalidateUserDetails();
							},
						);
					},
				}}
			/>
		</Form>
	);
};

const DownloadLogsButton = () => {
	const userDetails = useUserDetails();
	const dashboardData = useDashboardLayoutData();
	const isEditDisabled = dashboardData.isDemoInstance;

	const downloadLogsMutation = useMutation({
		mutationFn: async () => {
			const { generateLogDownloadUrl } = await clientGqlService.request(
				GenerateLogDownloadUrlDocument,
			);
			return generateLogDownloadUrl;
		},
		onSuccess: (downloadUrl) => {
			triggerDownload(downloadUrl, "ryot.log");
		},
		onError: () => {
			notifications.show({
				color: "red",
				title: "Error",
				message: "Failed to generate log download URL",
			});
		},
	});

	if (userDetails.lot !== UserLot.Admin) return null;

	return (
		<SettingsActionCard
			title="Download Logs"
			buttonText="Download Logs"
			icon={<IconDownload size={28} />}
			description="Download application logs for debugging and troubleshooting purposes."
			buttonProps={{
				disabled: isEditDisabled,
				loading: downloadLogsMutation.isPending,
				onClick: () => downloadLogsMutation.mutate(),
			}}
		/>
	);
};

const RETRY_CONCURRENCY = 5;

const PartialMetadataCard = () => {
	const theme = useMantineTheme();
	const [wizardIndex, setWizardIndex] = useState(0);
	const [wizardOpened, { open: openWizard, close: closeWizard }] =
		useDisclosure(false);
	const [wizardItems, setWizardItems] = useState<PartialMetadataListItem[]>(
		[],
	);
	const [retryProgress, setRetryProgress] = useState<{
		done: number;
		total: number;
	} | null>(null);

	const partialList = useQuery({
		queryKey: ["partialMetadataList"],
		queryFn: () =>
			clientGqlService
				.request(PartialMetadataListDocument)
				.then((d) => d.partialMetadataList),
	});

	const items = partialList.data || [];

	const retryAll = async () => {
		const queue = [...items];
		const total = queue.length;
		let done = 0;
		setRetryProgress({ done: 0, total });

		const worker = async () => {
			while (queue.length > 0) {
				const item = queue.shift();
				if (!item) break;
				try {
					const plainRetry = await clientGqlService.request(
						ReidentifyMetadataDocument,
						{
							newLot: item.lot,
							metadataId: item.id,
							newSource: item.source,
							newIdentifier: item.identifier,
						},
					);
					if (
						!plainRetry.reidentifyMetadata &&
						item.source === MediaSource.Tvdb
					) {
						await clientGqlService.request(
							AutoReidentifyMetadataViaTmdbDocument,
							{ metadataId: item.id },
						);
					}
				} catch {
					// Left as partial, will still show up in the refetched list below.
				}
				done += 1;
				setRetryProgress({ done, total });
			}
		};

		await Promise.all(
			Array.from({ length: RETRY_CONCURRENCY }, () => worker()),
		);
		await partialList.refetch();
		setRetryProgress(null);
	};

	const startWizard = () => {
		setWizardItems(items);
		setWizardIndex(0);
		openWizard();
	};

	const goToNext = () => {
		if (wizardIndex + 1 >= wizardItems.length) closeWizard();
		else setWizardIndex((i) => i + 1);
	};

	const currentWizardItem = wizardItems[wizardIndex];
	const retryPercent = retryProgress
		? Math.round((retryProgress.done / retryProgress.total) * 100)
		: 0;

	return (
		<>
			{currentWizardItem ? (
				<ReidentifyMetadataModal
					keepOpenOnSuccess
					opened={wizardOpened}
					onClose={closeWizard}
					key={currentWizardItem.id}
					metadataId={currentWizardItem.id}
					currentLot={currentWizardItem.lot}
					displayTitle={currentWizardItem.title}
					currentSource={currentWizardItem.source}
					currentIdentifier={currentWizardItem.identifier}
					onIdentified={() => {
						partialList.refetch();
						goToNext();
					}}
					headerExtra={
						<Group justify="space-between" mb="sm">
							<Text size="sm" c="dimmed">
								{wizardIndex + 1} of {wizardItems.length} remaining
							</Text>
							<Group gap="xs">
								<Button size="xs" variant="subtle" onClick={goToNext}>
									Skip
								</Button>
								<Button
									size="xs"
									color="red"
									variant="subtle"
									onClick={closeWizard}
								>
									Stop
								</Button>
							</Group>
						</Group>
					}
				/>
			) : null}
			<Paper
				withBorder
				radius="md"
				p={{ base: "sm", md: "lg" }}
				style={{ height: "100%", display: "flex", flexDirection: "column" }}
			>
				<Stack gap="md" style={{ flex: 1 }}>
					<Group gap="md" wrap="nowrap">
						<ActionIcon
							size={56}
							radius="md"
							variant="light"
							style={{ flexShrink: 0 }}
							color={theme.primaryColor}
						>
							<IconSearch size={28} />
						</ActionIcon>
						<Box style={{ flex: 1, minWidth: 0 }}>
							<Title order={4} lineClamp={2}>
								Unidentified media
							</Title>
						</Box>
					</Group>
					<Text size="sm" c="dimmed" style={{ flex: 1 }}>
						{items.length} item{items.length === 1 ? "" : "s"} could not be
						identified (showing as a raw import number instead of a title).
						Retry automatically, or identify what's left one by one.
					</Text>
					{retryProgress ? (
						<Stack gap={4}>
							<Progress value={retryPercent} animated />
							<Text size="xs" c="dimmed" ta="center">
								{retryProgress.done} / {retryProgress.total} ({retryPercent}%)
							</Text>
						</Stack>
					) : null}
					<Group grow>
						<Button
							variant="light"
							onClick={retryAll}
							loading={!!retryProgress}
							disabled={items.length === 0}
						>
							Retry all ({items.length})
						</Button>
						<Button
							variant="light"
							onClick={startWizard}
							disabled={items.length === 0 || !!retryProgress}
						>
							Identify manually
						</Button>
					</Group>
				</Stack>
			</Paper>
		</>
	);
};
