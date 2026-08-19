import {
	type StartedServices,
	startAllServices,
	stopAllServices,
} from "../src/setup/test-orchestrator";

// Playwright's `globalSetup` option accepts a default-exported function that
// can itself return a teardown function - the returned function is invoked
// automatically once after the whole test run finishes. This mirrors the
// vitest `globalSetup`/`globalTeardown` pair in `../src/setup/global-setup.ts`,
// just expressed as a single function instead of two named exports, and lets
// setup/teardown share the started services via closure instead of having to
// persist ports/PIDs to disk.
let services: StartedServices | undefined;

export default async function globalSetup() {
	console.log("[E2E GlobalSetup] Starting all services for tests...");
	try {
		services = await startAllServices();
		if (!services.caddyBaseUrl) {
			throw new Error(
				"[E2E GlobalSetup] Caddy base URL not available after starting services.",
			);
		}
		// Read by spec files (imported after global setup completes) to build
		// absolute URLs for both `page.goto()` and the GraphQL test utilities.
		process.env.API_BASE_URL = services.caddyBaseUrl;
		console.log(
			`[E2E GlobalSetup] Services started. API_BASE_URL set to: ${services.caddyBaseUrl}`,
		);
	} catch (error) {
		console.error("[E2E GlobalSetup] Failed to start services:", error);
		await teardown();
		throw error;
	}

	return teardown;
}

async function teardown(): Promise<void> {
	console.log("[E2E GlobalTeardown] Tearing down all services...");
	if (services) {
		await stopAllServices(services);
		services = undefined;
	} else {
		console.log(
			"[E2E GlobalTeardown] No services were recorded as started, nothing to stop explicitly.",
		);
	}
	console.log("[E2E GlobalTeardown] Teardown complete.");
}
