import { EntityLot } from "@ryot/generated/graphql/backend/graphql";
import {
	type StartedServices,
	startAllServices,
	stopAllServices,
} from "../src/setup/test-orchestrator";
import {
	addEntitiesToCollection,
	registerAdminUser,
	searchAudibleAudiobook,
} from "../src/utils";

// Spins up the same Postgres + MinIO + real backend/frontend/Caddy stack used
// by the vitest integration suite, seeds a bit of data, then keeps it alive
// so k6 scripts in tests/bench/k6/*.js can be pointed at it.
//
// Usage: yarn workspace @ryot/tests bench:setup
// Stop with Ctrl+C once you're done benchmarking.

async function main() {
	console.log(
		"[Bench] Starting services (this can take a while on first run)...",
	);
	const services = await startAllServices();

	console.log(`[Bench] Stack ready at ${services.caddyBaseUrl}`);

	const [apiKey, userId] = await registerAdminUser(services.caddyBaseUrl);

	const harryPotterResults = await searchAudibleAudiobook(
		services.caddyBaseUrl,
		apiKey,
		"Harry Potter and the Philosopher's Stone",
	);
	if (harryPotterResults.length === 0) {
		throw new Error("[Bench] Seed search returned no results, aborting");
	}
	const metadataId = harryPotterResults[0];

	await addEntitiesToCollection(
		services.caddyBaseUrl,
		apiKey,
		userId,
		"Watchlist",
		[{ entityId: metadataId, entityLot: EntityLot.Metadata }],
	);

	printBenchInstructions(services, apiKey, metadataId);

	await waitForCtrlC();
	await stopAllServices(services);
	console.log("[Bench] Stopped.");
}

function printBenchInstructions(
	services: StartedServices,
	apiKey: string,
	metadataId: string,
) {
	const baseUrl = services.caddyBaseUrl;
	const graphqlUrl = `${baseUrl}/backend/graphql`;

	console.log(
		"\n[Bench] Environment ready. Run k6 scripts from tests/bench/k6/, e.g.:\n",
	);
	console.log(
		`  k6 run --summary-export=tests/bench/results/metadata-details-BEFORE.json -e GRAPHQL_URL=${graphqlUrl} -e API_KEY=${apiKey} -e METADATA_ID=${metadataId} tests/bench/k6/metadata-details.js`,
	);
	console.log(
		`  k6 run --summary-export=tests/bench/results/presigned-urls-BEFORE.json -e GRAPHQL_URL=${graphqlUrl} -e API_KEY=${apiKey} tests/bench/k6/presigned-urls.js`,
	);
	console.log(
		`  k6 run --summary-export=tests/bench/results/concurrent-load-BEFORE.json -e GRAPHQL_URL=${graphqlUrl} -e API_KEY=${apiKey} tests/bench/k6/concurrent-load.js`,
	);
	console.log(
		"\n[Bench] Re-run the same commands with -AFTER suffix once a point is implemented, then diff the JSON summaries (p50/p95/p99, http_req_duration).",
	);
	console.log(
		"[Bench] Press Ctrl+C here to tear the environment down when done.\n",
	);
}

function waitForCtrlC(): Promise<void> {
	return new Promise((resolve) => {
		process.once("SIGINT", () => resolve());
	});
}

main().catch((err) => {
	console.error("[Bench] Failed:", err);
	process.exit(1);
});
