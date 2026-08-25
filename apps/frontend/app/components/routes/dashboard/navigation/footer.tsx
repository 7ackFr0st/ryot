import { Flex, Text } from "@mantine/core";
import { useCoreDetails } from "~/lib/shared/hooks";

export const Footer = () => {
	const coreDetails = useCoreDetails();

	return (
		<Flex gap={80} justify="center">
			<Text c="grape" fw="bold" visibleFrom="md">
				{coreDetails.version}
			</Text>
		</Flex>
	);
};
