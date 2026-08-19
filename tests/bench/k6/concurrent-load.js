import { check, sleep } from "k6";
import http from "k6/http";

// Simulates several users browsing concurrently, hitting internal (non-external-provider)
// queries — relevant to plan point 5 (DB connection pool sizing/contention).
// Deliberately avoids metadataSearch/external provider calls: those hit Audible over the
// network and would measure Audible's latency, not Ryot's own DB/pool behaviour.

export const options = {
	stages: [
		{ duration: "10s", target: 20 },
		{ duration: "30s", target: 20 },
		{ duration: "10s", target: 0 },
	],
	thresholds: {
		http_req_failed: ["rate<0.01"],
	},
};

const GRAPHQL_URL = __ENV.GRAPHQL_URL;
const API_KEY = __ENV.API_KEY;

const QUERY = `
	query UserMetadataList($input: UserMetadataListInput!) {
		userMetadataList(input: $input) {
			response {
				items
				details {
					totalItems
				}
			}
		}
	}
`;

export default function () {
	const res = http.post(
		GRAPHQL_URL,
		JSON.stringify({
			query: QUERY,
			variables: { input: {} },
		}),
		{
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${API_KEY}`,
			},
		},
	);

	check(res, {
		"status is 200": (r) => r.status === 200,
		"no graphql errors": (r) => !JSON.parse(r.body).errors,
	});

	sleep(0.2);
}
