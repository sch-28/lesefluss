import { expect, test as setup } from "@playwright/test";
import {
	apiAs,
	authFile,
	getJson,
	LIVE_BOOK,
	postJson,
	submitLogin,
	USERS,
	type UserKey,
} from "../support/app";

/**
 * Signs every seeded account in through the real /login page and keeps its
 * cookie session, then prepares the social state the specs start from. The
 * specs test the browser part; the preparation goes through the same HTTP API
 * the app uses.
 */
setup("sign in every account through /login and save its session", async ({ browser }) => {
	for (const user of Object.keys(USERS) as UserKey[]) {
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto("/login");
		await submitLogin(page, user);
		await page.waitForURL(/\/profile$/);
		await context.storageState({ path: authFile(user) });
		await context.close();
	}
});

setup("claim handles, befriend cy and dee, and put both in a buddy read", async () => {
	for (const user of Object.keys(USERS) as UserKey[]) {
		const { handle, name } = USERS[user];
		if (!handle) continue;
		const api = await apiAs(user);
		await postJson(api, "/api/social/handle", { handle, name });
		await api.dispose();
	}

	const cy = await apiAs("cy");
	const dee = await apiAs("dee");
	const { url } = await postJson<{ url: string }>(cy, "/api/social/invite");
	const token = url.split("/invite/")[1];
	await postJson(dee, "/api/social/invite-redeem", { token });

	const content = LIVE_BOOK.paragraphs.join("\n\n");
	const now = Date.now();
	await postJson(cy, "/api/sync", {
		books: [
			{
				bookId: LIVE_BOOK.bookId,
				title: LIVE_BOOK.title,
				author: "E2E",
				fileSize: content.length,
				wordCount: content.split(/\s+/).length,
				wordPosition: 0,
				content,
				metadataUpdatedAt: now,
				updatedAt: now,
			},
		],
		settings: null,
		highlights: [],
	});
	await postJson(cy, "/api/social/buddy-read", {
		bookId: LIVE_BOOK.bookId,
		inviteeIds: [USERS.dee.id],
	});
	const inbox = await getJson<{
		items: { type: string; subject?: { kind: string; inviteId?: string } }[];
	}>(dee, "/api/social/inbox");
	const invite = inbox.items.find((i) => i.type === "buddy_read_invite");
	expect(invite?.subject?.inviteId).toBeTruthy();
	await postJson(dee, "/api/social/buddy-read-invite-respond", {
		inviteId: invite?.subject?.inviteId,
		action: "accept",
	});
	await cy.dispose();
	await dee.dispose();
});
