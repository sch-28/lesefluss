import type { Page } from "@playwright/test";

export const MOCK_EMAIL = "reader@example.com";
export const MOCK_SESSION_TOKEN = "e2e-session-token";

/**
 * Answers everything the app calls after a sign-in: the session check and an
 * empty library for the first sync, so the success toast fires. The dev server
 * has VITE_SYNC_URL set, so the native sign-in paths render in the browser
 * build too; nothing reaches a real server.
 */
export async function mockSessionAndSync(page: Page) {
	await page.route("**/api/auth/get-session", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ user: { email: MOCK_EMAIL }, session: { token: MOCK_SESSION_TOKEN } }),
		}),
	);
	const emptySync = JSON.stringify({
		books: [],
		series: [],
		highlights: [],
		glossaryEntries: [],
		readingSessions: [],
		contentBookIds: [],
	});
	await page.route(/\/api\/sync(\/|\?|$)/, (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: emptySync }),
	);
	await page.route(/\/api\/social(\/|\?|$)/, (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
	);
}

export async function mockPasswordSignIn(page: Page, status = 200) {
	await page.route("**/api/auth/sign-in/email", async (route) => {
		if (status !== 200) {
			await route.fulfill({
				status,
				contentType: "application/json",
				body: JSON.stringify({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email" }),
			});
			return;
		}
		const body = route.request().postDataJSON() as { email: string };
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ token: MOCK_SESSION_TOKEN, user: { email: body.email } }),
		});
	});
}

export const MOCK_USER_CODE = "ABCD2345";

/**
 * Device-link endpoints: one code, then `pendingPolls` pending answers before
 * the terminal one (approved by default, or an error code such as expired_token).
 */
export async function mockDeviceSignIn(
	page: Page,
	{ pendingPolls = 1, outcome = "approved" }: { pendingPolls?: number; outcome?: string } = {},
) {
	await page.route("**/api/auth/device/code", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				device_code: "e2e-device-code",
				user_code: MOCK_USER_CODE,
				verification_uri: "https://lesefluss.app/link",
				verification_uri_complete: `https://lesefluss.app/link?user_code=${MOCK_USER_CODE}`,
				expires_in: 600,
				interval: 1,
			}),
		}),
	);
	let polls = 0;
	await page.route("**/api/auth/device/token", (route) => {
		polls += 1;
		if (polls <= pendingPolls) {
			return route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({ error: "authorization_pending" }),
			});
		}
		if (outcome === "approved") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ access_token: MOCK_SESSION_TOKEN, token_type: "Bearer" }),
			});
		}
		return route.fulfill({
			status: 400,
			contentType: "application/json",
			body: JSON.stringify({ error: outcome }),
		});
	});
}
