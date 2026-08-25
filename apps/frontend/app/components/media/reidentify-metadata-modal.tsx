import {
	Button,
	Group,
	Image,
	Loader,
	Modal,
	Paper,
	Select,
	SimpleGrid,
	Stack,
	Tabs,
	Text,
	TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
	MediaLot,
	MediaSource,
	MetadataSearchDocument,
	ReidentifyMetadataDocument,
} from "@ryot/generated/graphql/backend/graphql";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import {
	clientGqlService,
	getMetadataDetailsQuery,
	refreshEntityDetails,
} from "~/lib/shared/react-query";
import { convertEnumToSelectData } from "~/lib/shared/ui-utils";

/**
 * Search-by-title or enter-id-manually flow to re-point a metadata item
 * (typically partial/unidentified) to the correct provider entry.
 */
export const ReidentifyMetadataModal = (props: {
	opened: boolean;
	onClose: () => void;
	metadataId: string;
	currentLot: MediaLot;
	displayTitle: string;
	/** The item's current (likely wrong/partial) source and identifier, used
	 * to default the search source and pre-fill the manual-id field so the
	 * failed number is visible as a starting point instead of a blank input. */
	currentSource: MediaSource;
	currentIdentifier: string;
	onIdentified?: () => void;
	/** For wizard usage: don't auto-close on a successful identify, let the parent advance instead. */
	keepOpenOnSuccess?: boolean;
	/** Extra content rendered in the header, eg. "3 of 12 remaining" + Skip/Stop buttons. */
	headerExtra?: ReactNode;
}) => {
	const [lot, setLot] = useState<MediaLot>(props.currentLot);
	const [source, setSource] = useState<MediaSource>(props.currentSource);
	const [query, setQuery] = useState("");
	const [manualIdentifier, setManualIdentifier] = useState(
		props.currentIdentifier,
	);
	const [debouncedQuery] = useDebouncedValue(query, 400);

	const searchResults = useQuery({
		enabled: debouncedQuery.length > 1,
		queryKey: ["reidentifyMetadataSearch", lot, source, debouncedQuery],
		queryFn: () =>
			clientGqlService
				.request(MetadataSearchDocument, {
					input: { lot, source, search: { query: debouncedQuery, page: 1 } },
				})
				.then((d) => d.metadataSearch.response.items),
	});

	const reidentify = useMutation({
		mutationFn: (input: {
			newLot: MediaLot;
			newSource: MediaSource;
			newIdentifier: string;
		}) =>
			clientGqlService.request(ReidentifyMetadataDocument, {
				metadataId: props.metadataId,
				...input,
			}),
		onSuccess: (data) => {
			refreshEntityDetails(props.metadataId);
			const success = data.reidentifyMetadata;
			notifications.show({
				color: success ? "green" : "yellow",
				title: success ? "Identified" : "Still not found",
				message: success
					? "Item re-identified successfully"
					: "Could not fetch details for that match, try another one",
			});
			if (success) {
				props.onIdentified?.();
				if (!props.keepOpenOnSuccess) props.onClose();
			}
		},
	});

	const typeAndSourceSelect = (
		<Group grow wrap="nowrap">
			<Select
				label="Type"
				value={lot}
				data={convertEnumToSelectData(MediaLot)}
				onChange={(v) => v && setLot(v as MediaLot)}
			/>
			<Select
				label="Source"
				value={source}
				data={convertEnumToSelectData(MediaSource)}
				onChange={(v) => v && setSource(v as MediaSource)}
			/>
		</Group>
	);

	return (
		<Modal
			size="lg"
			opened={props.opened}
			onClose={props.onClose}
			title={`Identify "${props.displayTitle}"`}
		>
			{props.headerExtra}
			<Tabs defaultValue="search">
				<Tabs.List>
					<Tabs.Tab value="search">Search by title</Tabs.Tab>
					<Tabs.Tab value="manual">Enter ID manually</Tabs.Tab>
				</Tabs.List>
				<Tabs.Panel value="search" pt="md">
					<Stack>
						{typeAndSourceSelect}
						<TextInput
							value={query}
							label="Search"
							placeholder="Type the title..."
							onChange={(e) => setQuery(e.target.value)}
						/>
						{searchResults.isLoading ? <Loader mx="auto" /> : null}
						<SimpleGrid cols={{ base: 2, md: 3 }}>
							{(searchResults.data || []).map((identifier) => (
								<SearchResultCard
									lot={lot}
									source={source}
									key={identifier}
									identifier={identifier}
									disabled={reidentify.isPending}
									onSelect={() =>
										reidentify.mutate({
											newLot: lot,
											newSource: source,
											newIdentifier: identifier,
										})
									}
								/>
							))}
						</SimpleGrid>
						{searchResults.data?.length === 0 ? (
							<Text c="dimmed" ta="center">
								No results
							</Text>
						) : null}
					</Stack>
				</Tabs.Panel>
				<Tabs.Panel value="manual" pt="md">
					<Stack>
						{typeAndSourceSelect}
						<TextInput
							label="Provider ID"
							value={manualIdentifier}
							placeholder="eg: the TMDB numeric id"
							onChange={(e) => setManualIdentifier(e.target.value)}
							description="Pre-filled with the current (likely wrong) id — change it, or switch Source above and try the same number there"
						/>
						<Button
							disabled={!manualIdentifier}
							loading={reidentify.isPending}
							onClick={() =>
								reidentify.mutate({
									newLot: lot,
									newSource: source,
									newIdentifier: manualIdentifier,
								})
							}
						>
							Apply
						</Button>
					</Stack>
				</Tabs.Panel>
			</Tabs>
		</Modal>
	);
};

const SearchResultCard = (props: {
	lot: MediaLot;
	source: MediaSource;
	disabled: boolean;
	identifier: string;
	onSelect: () => void;
}) => {
	const { data } = useQuery(getMetadataDetailsQuery(props.identifier));

	return (
		<Paper
			p="xs"
			withBorder
			style={{
				opacity: props.disabled ? 0.6 : 1,
				cursor: props.disabled ? "not-allowed" : "pointer",
			}}
			onClick={() => {
				if (!props.disabled) props.onSelect();
			}}
		>
			<Stack gap={4} align="center">
				<Image
					h={140}
					radius="sm"
					fit="cover"
					fallbackSrc="https://placehold.co/200x300?text=No+image"
					src={data?.assets.remoteImages.at(0)}
				/>
				<Text size="sm" ta="center" lineClamp={2}>
					{data?.title || "Loading..."}
				</Text>
				{data?.publishYear ? (
					<Text size="xs" c="dimmed">
						{data.publishYear}
					</Text>
				) : null}
			</Stack>
		</Paper>
	);
};
