import {
	DEVICE_LINK_CLIENT_ID,
	DEVICE_LINK_GRANT_TYPE,
	formatDeviceLinkCode,
} from "@lesefluss/core";
import { type APIRequestContext, expect, request, test } from "@playwright/test";
import { BASE_URL, submitLogin, USERS } from "./support/app";

type Grant = {
	device_code: string;
	user_code: string;
	verification_uri_complete: string;
	interval: number;
};

/** The app's side of the flow, as plain HTTP: it holds the device code and polls. */
async function requestGrant(app: APIRequestContext): Promise<Grant> {
	const res = await app.post("/api/auth/device/code", {
		data: { client_id: DEVICE_LINK_CLIENT_ID },
	});
	expect(res.ok()).toBe(true);
	return (await res.json()) as Grant;
}

function poll(app: APIRequestContext, grant: Grant) {
	return app.post("/api/auth/device/token", {
		data: {
			grant_type: DEVICE_LINK_GRANT_TYPE,
			device_code: grant.device_code,
			client_id: DEVICE_LINK_CLIENT_ID,
		},
	});
}

test("a code shown by the app is confirmed on the website and signs the app in", async ({
	page,
}) => {
	const app = await request.newContext({ baseURL: BASE_URL });
	const grant = await requestGrant(app);
	expect(grant.verification_uri_complete).toContain(`/link?user_code=${grant.user_code}`);

	const pending = await poll(app, grant);
	expect(pending.status()).toBe(400);
	expect((await pending.json()).error).toBe("authorization_pending");

	// Signed out on the phone: through login and back to the same code.
	await page.goto(grant.verification_uri_complete);
	await expect(page.getByRole("heading", { name: "Sign in another device" })).toBeVisible();
	await page.getByRole("link", { name: "Sign in" }).click();
	await page.waitForURL(/\/login\?redirect=/);
	await submitLogin(page, "fay");
	await page.waitForURL(/\/link\?user_code=/);

	await expect(page.getByText(USERS.fay.email)).toBeVisible();
	await expect(page.getByLabel("Code from the app")).toHaveValue(
		formatDeviceLinkCode(grant.user_code),
	);
	await page.getByRole("checkbox").check();
	await page.getByRole("button", { name: "Sign in that device" }).click();
	await expect(page.getByRole("heading", { name: "Done" })).toBeVisible();

	// The app polls no faster than the server's interval.
	await page.waitForTimeout(grant.interval * 1000 + 200);
	const issued = await poll(app, grant);
	expect(issued.ok()).toBe(true);
	const { access_token: token } = (await issued.json()) as { access_token: string };
	const session = await app.get("/api/auth/get-session", {
		headers: { Authorization: `Bearer ${token}` },
	});
	expect(((await session.json()) as { user: { email: string } }).user.email).toBe(USERS.fay.email);

	// Single use: the code is gone for the app and for the website.
	const again = await poll(app, grant);
	expect(again.status()).toBe(400);
	await page.goto(grant.verification_uri_complete);
	await page.getByRole("checkbox").check();
	await page.getByRole("button", { name: "Sign in that device" }).click();
	await expect(page.getByRole("heading", { name: "That code didn't match" })).toBeVisible();
	await app.dispose();
});

test("denying on the website leaves the app signed out", async ({ page }) => {
	const app = await request.newContext({ baseURL: BASE_URL });
	const grant = await requestGrant(app);

	await page.goto(grant.verification_uri_complete);
	await page.getByRole("link", { name: "Sign in" }).click();
	await page.waitForURL(/\/login\?redirect=/);
	await submitLogin(page, "fay");
	await page.waitForURL(/\/link\?user_code=/);
	await page.getByRole("button", { name: "Not me, deny" }).click();
	await expect(page.getByRole("heading", { name: "Denied" })).toBeVisible();

	const denied = await poll(app, grant);
	expect(denied.status()).toBe(400);
	expect((await denied.json()).error).toBe("access_denied");
	await app.dispose();
});
