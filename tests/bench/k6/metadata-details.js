import { check, sleep } from "k6";
import http from "k6/http";

// Benchmarks repeated reads of the same metadata item — this is the "cache hit"
// path relevant to plan points 2 (in-process cache) and 4 (N+1 fixes).
// Get GRAPHQL_URL / API_KEY / METADATA_ID from `yarn workspace @ryot/tests bench:setup`.

export const options = {
	vus: 15,
	duration: "30s",
	thresholds: {
		http_req_failed: ["rate<0.01"],
	},
};

const GRAPHQL_URL = __ENV.GRAPHQL_URL;
const API_KEY = __ENV.API_KEY;
const METADATA_ID = __ENV.METADATA_ID;

const QUERY = `
	query UserMetadataDetails($metadataId: String!) {
		userMetadataDetails(metadataId: $metadataId) {
			response {
				history {
					id
					progress
				}
				collections {
					details {
						collectionId
						collectionName
					}
				}
				averageRating
			}
		}
	}
`;

export default function () {
	const res = http.post(
		GRAPHQL_URL,
		JSON.stringify({
			query: QUERY,
			variables: { metadataId: METADATA_ID },
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

	sleep(0.1);
}
