import { check, sleep } from "k6";
import http from "k6/http";

// Benchmarks the CURRENT frontend behaviour for point 3: one GraphQL request
// per image key (apps/frontend/app/lib/shared/hooks/index.ts useS3PresignedUrls,
// Promise.all over N keys). Presigning doesn't touch S3 itself (pure local HMAC
// computation, see crates/services/file-storage/src/lib.rs get_presigned_url),
// so fake keys are fine here — we're measuring GraphQL/HTTP round-trip overhead,
// not S3 latency.
//
// Once point 3 adds a batched `getPresignedS3Urls(keys: [String!]!)` resolver,
// duplicate this script to send ONE request with all keys and compare.

export const options = {
	vus: 10,
	duration: "30s",
	thresholds: {
		http_req_failed: ["rate<0.01"],
	},
};

const GRAPHQL_URL = __ENV.GRAPHQL_URL;
const API_KEY = __ENV.API_KEY;
const IMAGES_PER_PAGE = Number(__ENV.IMAGES_PER_PAGE || 20);

const QUERY = `
	query GetPresignedS3Url($key: String!) {
		getPresignedS3Url(key: $key)
	}
`;

export default function () {
	// Simulates loading a grid of N posters: N sequential GraphQL requests,
	// same as the current Promise.all(keys.map(...)) frontend pattern (each
	// request still round-trips independently over HTTP even when "parallel").
	for (let i = 0; i < IMAGES_PER_PAGE; i++) {
		const res = http.post(
			GRAPHQL_URL,
			JSON.stringify({
				query: QUERY,
				variables: { key: `bench/poster-${i}.jpg` },
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
	}

	sleep(0.1);
}
