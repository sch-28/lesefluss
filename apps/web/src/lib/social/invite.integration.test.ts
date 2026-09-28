// @vitest-environment node
//
// Invite links against a real Postgres database. Skipped when DATABASE_URL is
// unset so it never breaks `pnpm test`.
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { socialBlock, socialHandle, socialInvite } from "~/db/schema";
import { removeFriend } from "./friends";
import { claimHandle } from "./handle";
import {
	createInvite,
	getCurrentInvite,
	previewInvite,
	redeemInvite,
	revokeInvite,
} from "./invite";
import { areFriends } from "./relationship";

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY_MS = 86_400_000;

function tokenOf(url: string): string {
	return url.slice(url.lastIndexOf("/") + 1);
}

describe.skipIf(!hasDb)("invite links (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const owner = `test-inv-o-${run}`;
	const guest = `test-inv-g-${run}`;
	const noHandle = `test-inv-n-${run}`;
	const all = [owner, guest, noHandle];

	beforeAll(async () => {
		await db
			.insert(user)
			.values(all.map((id) => ({ id, name: `Name ${id}`, email: `${id}@example.test` })));
		await claimHandle(owner, `owner_${run}`, "Owner");
		await claimHandle(guest, `guest_${run}`, "Guest");
	});

	afterAll(async () => {
		await db.delete(user).where(inArray(user.id, all));
		const rows = await db.select({ handle: socialHandle.handle }).from(socialHandle);
		const mine = rows.map((r) => r.handle).filter((h) => h.endsWith(`_${run}`));
		if (mine.length > 0) await db.delete(socialHandle).where(inArray(socialHandle.handle, mine));
	});

	test("a user without a handle cannot create a link", async () => {
		await expect(createInvite(noHandle)).rejects.toMatchObject({ code: "handle_required" });
	});

	test("one active link per owner; creating a new one replaces the old", async () => {
		const first = await createInvite(owner);
		expect(first.url).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);
		expect((await getCurrentInvite(owner))?.url).toBe(first.url);
		const second = await createInvite(owner);
		expect(second.url).not.toBe(first.url);
		expect((await getCurrentInvite(owner))?.url).toBe(second.url);
		expect(await previewInvite(db, guest, tokenOf(first.url))).toEqual({ state: "invalid" });
		expect(
			await db.select().from(socialInvite).where(eq(socialInvite.ownerId, owner)),
		).toHaveLength(1);
	});

	test("preview states never redeem", async () => {
		const { url } = await createInvite(owner);
		const token = tokenOf(url);
		const ownerCard = { userId: owner, handle: `owner_${run}`, name: "Owner", avatarUrl: null };
		expect(await previewInvite(db, null, token)).toEqual({ state: "signed_out", owner: ownerCard });
		expect(await previewInvite(db, owner, token)).toEqual({ state: "own", owner: ownerCard });
		expect(await previewInvite(db, noHandle, token)).toEqual({
			state: "handle_required",
			owner: ownerCard,
		});
		expect(await previewInvite(db, guest, token)).toEqual({ state: "valid", owner: ownerCard });
		expect(await previewInvite(db, guest, "nope")).toEqual({ state: "invalid" });
		expect(await areFriends(db, owner, guest)).toBe(false);
	});

	test("redeeming creates an accepted friendship once; own and repeated redeems create nothing", async () => {
		const { url } = await createInvite(owner);
		const token = tokenOf(url);
		expect((await redeemInvite(owner, token)).state).toBe("own");
		expect((await redeemInvite(noHandle, token)).state).toBe("handle_required");
		expect(await areFriends(db, owner, guest)).toBe(false);
		expect((await redeemInvite(guest, token)).state).toBe("already_friends");
		expect(await areFriends(db, owner, guest)).toBe(true);
		expect((await redeemInvite(guest, token)).state).toBe("already_friends");
		expect((await previewInvite(db, guest, token)).state).toBe("already_friends");
		await removeFriend(owner, guest);
	});

	test("expired and revoked links are invalid", async () => {
		const { url, expiresAt } = await createInvite(owner);
		const token = tokenOf(url);
		const afterExpiry = new Date(expiresAt + DAY_MS);
		expect(await previewInvite(db, guest, token, afterExpiry)).toEqual({ state: "invalid" });
		expect((await redeemInvite(guest, token, afterExpiry)).state).toBe("invalid");
		expect(await getCurrentInvite(owner, afterExpiry)).toBeNull();
		await revokeInvite(owner);
		expect(await previewInvite(db, guest, token)).toEqual({ state: "invalid" });
		expect(await getCurrentInvite(owner)).toBeNull();
	});

	test("a link between blocked users looks exactly like an expired one", async () => {
		const { url } = await createInvite(owner);
		const token = tokenOf(url);
		await db.insert(socialBlock).values({ blockerId: owner, blockedId: guest });
		expect(await previewInvite(db, guest, token)).toEqual({ state: "invalid" });
		expect((await redeemInvite(guest, token)).state).toBe("invalid");
		await db.delete(socialBlock).where(eq(socialBlock.blockerId, owner));
		await db.insert(socialBlock).values({ blockerId: guest, blockedId: owner });
		expect(await previewInvite(db, guest, token)).toEqual({ state: "invalid" });
		await db.delete(socialBlock).where(eq(socialBlock.blockerId, guest));
		expect(await areFriends(db, owner, guest)).toBe(false);
	});

	test("a banned or handle-less owner makes the link invalid", async () => {
		const { url } = await createInvite(owner);
		const token = tokenOf(url);
		await db.update(user).set({ banned: true }).where(eq(user.id, owner));
		expect(await previewInvite(db, guest, token)).toEqual({ state: "invalid" });
		await db.update(user).set({ banned: false }).where(eq(user.id, owner));
		expect((await previewInvite(db, guest, token)).state).toBe("valid");
	});
});
