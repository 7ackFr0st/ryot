import { defineConfig, devices } from "@playwright/test";

// A minimal, fast smoke suite meant to be run repeatedly during the
// performance-optimization work. It reuses the same real Postgres + MinIO +
// backend + frontend + Caddy stack that the vitest integration suite spins
// up (see ./e2e/global-setup.ts), so no separate dev server config is needed
// here - the base URL is communicated to spec files via `API_BASE_URL`,
// which is set on `process.env` inside global setup before any test file is
// imported.
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: [["list"], ["html", { open: "never" }]],
	globalSetup: "./e2e/global-setup.ts",
	use: {
		headless: true,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
