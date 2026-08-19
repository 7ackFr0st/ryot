import { expect, test } from "@playwright/test";
import { MetadataDetailsDocument } from "@ryot/generated/graphql/backend/graphql";
import {
	getGraphqlClient,
	registerAdminUser,
	searchAudibleAudiobook,
} from "src/utils";

// The frontend reads/writes its auth token from this cookie - see
// FRONTEND_AUTH_COOKIE_NAME in apps/frontend/app/lib/shared/constants.ts and
// its usage in apps/frontend/app/lib/utilities.server.ts (server loaders) and
// apps/frontend/app/lib/shared/react-query.ts (client GraphQL requests). It
// is a plain, non-httpOnly cookie set to the raw API key, so injecting it
// directly is equivalent to logging in through the UI form and lets this
// smoke test skip a fragile login flow.
const AUTH_COOKIE_NAME = "Auth";

// Minimal, cheap smoke coverage for the critical path touched by the
// performance-optimization plan (React Query staleTime tuning, batched image
// presign URLs): does a media item page render, can a user act on it, does
// analytics render, and does basic navigation avoid blank/error pages.
test.describe("Critical path smoke test", () => {
	test("media item detail, actions tab, analytics, and navigation", async ({
		page,
		context,
	}) => {
		const baseUrl = process.env.API_BASE_URL;
		if (!baseUrl) throw new Error("API_BASE_URL was not set by global setup");

		const [apiKey] = await registerAdminUser(baseUrl);

		const [metadataId] = await searchAudibleAudiobook(
			baseUrl,
			apiKey,
			"Dune Frank Herbert",
		);
		expect(metadataId, "search should return at least one result").toBeTruthy();

		const client = getGraphqlClient(baseUrl);
		const { metadataDetails } = await client.request(
			MetadataDetailsDocument,
			{ metadataId },
			{ Authorization: `Bearer ${apiKey}` },
		);
		const title = metadataDetails.response.title;

		// Skip the login form entirely - see AUTH_COOKIE_NAME comment above.
		await context.addCookies([
			{ name: AUTH_COOKIE_NAME, value: apiKey, url: baseUrl },
		]);

		const itemUrl = `${baseUrl}/media/item/${metadataId}?defaultTab=actions`;

		await test.step("media item detail page renders with Actions tab active", async () => {
			await page.goto(itemUrl);
			await expect(
				page.getByText(title, { exact: false }).first(),
			).toBeVisible();
			await expect(
				page.getByRole("tab", { name: "Actions", selected: true }),
			).toBeVisible();
		});

		const watchlistButton = page.getByRole("button", {
			name: "Add to watchlist",
		});

		await test.step("actions tab: add item to watchlist", async () => {
			await expect(watchlistButton).toBeVisible();
			await watchlistButton.click();

			// Adding to a collection deploys an async background job (the same
			// pattern the `addEntitiesToCollection` helper in ../src/utils.ts waits
			// ~1s for) - give it time to be processed, then reload to read the
			// authoritative state from the server instead of polling client cache.
			await page.waitForTimeout(2500);
			await page.reload();
			await expect(watchlistButton).toBeHidden();
		});

		await test.step("analytics page renders", async () => {
			await page.goto(`${baseUrl}/analytics`);
			await expect(
				page.getByText("Analytics", { exact: true }).first(),
			).toBeVisible();
		});

		await test.step("basic navigation regression guard", async () => {
			await page.goto(`${baseUrl}/`);
			await expect(page.locator("main")).toBeVisible();

			await page.goto(itemUrl);
			await expect(
				page.getByRole("tab", { name: "Actions", selected: true }),
			).toBeVisible();

			await page.goBack();
			await expect(page.locator("main")).toBeVisible();
		});
	});
});
