// @vitest-environment node
//
// Handle claims against a real Postgres database. Skipped when DATABASE_URL is
// unset (e.g. CI without a DB) so it never breaks `pnpm test`. Run locally with:
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/rsvp pnpm test social/handle
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { socialHandle, socialProfile } from "~/db/schema";
import { SocialError } from "./errors";
import {
	checkHandleAvailability,
	claimHandle,
	forceResetHandle,
	releaseHandlesForDeletedUser,
} from "./handle";
import { getOwnProfile, updateOwnProfile } from "./profile";

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY_MS = 86_400_000;

async function expectSocialError(promise: Promise<unknown>, code: SocialError["code"]) {
	await expect(promise).rejects.toBeInstanceOf(SocialError);
	await expect(promise).rejects.toMatchObject({ code });
}

describe.skipIf(!hasDb)("handle claims (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const alice = `test-social-a-${run}`;
	const bob = `test-social-b-${run}`;
	const carol = `test-social-c-${run}`;
	const users = [alice, bob, carol];
	// Handles are global, so each run needs its own to stay isolated.
	const h = (name: string) => `${name}_${run}`;
	// Clock for the admin-reset and deletion tests, past every earlier cooldown.
	const resetAt = new Date(Date.now() + 200 * DAY_MS);
	const afterReset = new Date(resetAt.getTime() + 31 * DAY_MS);

	beforeAll(async () => {
		await db
			.insert(user)
			.values(users.map((id) => ({ id, name: `Name ${id}`, email: `${id}@example.test` })));
	});

	afterAll(async () => {
		await db.delete(socialHandle).where(inArray(socialHandle.userId, users));
		await db.delete(user).where(inArray(user.id, users));
		// Rows released by deletion tests lost their user_id; sweep by prefix.
		const stray = await db.select({ handle: socialHandle.handle }).from(socialHandle);
		const mine = stray.map((r) => r.handle).filter((x) => x.endsWith(`_${run}`));
		if (mine.length > 0) await db.delete(socialHandle).where(inArray(socialHandle.handle, mine));
	});

	test("a user without a profile row gets the defaults", async () => {
		const profile = await getOwnProfile(alice);
		expect(profile).toMatchObject({
			handle: null,
			handleChangedAt: null,
			name: `Name ${alice}`,
			bio: null,
			avatarUrl: null,
			visibility: "private",
			showCurrentlyReading: true,
			showFinished: true,
			showStats: true,
			showHighlights: true,
		});
	});

	test("claims a handle, normalises it and sets the display name", async () => {
		await claimHandle(alice, h("Alice"), "Alice A.");
		const profile = await getOwnProfile(alice);
		expect(profile?.handle).toBe(h("alice"));
		expect(profile?.name).toBe("Alice A.");
		expect(profile?.handleChangedAt).not.toBeNull();
		await expect(checkHandleAvailability(alice, h("ALICE"))).resolves.toEqual({
			available: true,
		});
	});

	test("nobody else can claim it in any letter case", async () => {
		await expectSocialError(claimHandle(bob, h("ALICE"), "Bob"), "taken");
		await expect(checkHandleAvailability(bob, h("Alice"))).resolves.toEqual({
			available: false,
			reason: "taken",
		});
	});

	test("rejects invalid and reserved handles with the reason", async () => {
		await expectSocialError(claimHandle(bob, "ab", "Bob"), "invalid");
		await expectSocialError(claimHandle(bob, "Kelvin", "Bob"), "invalid");
		await expectSocialError(claimHandle(bob, "Admin", "Bob"), "reserved");
		await expect(checkHandleAvailability(bob, "lesefluss")).resolves.toEqual({
			available: false,
			reason: "reserved",
		});
	});

	test("concurrent claims of a fresh handle produce exactly one success", async () => {
		const results = await Promise.allSettled([
			claimHandle(bob, h("race"), "Bob"),
			claimHandle(carol, h("race"), "Carol"),
		]);
		const winners = results.filter((r) => r.status === "fulfilled");
		const losers = results.filter((r) => r.status === "rejected");
		expect(winners).toHaveLength(1);
		expect(losers).toHaveLength(1);
		expect((losers[0] as PromiseRejectedResult).reason).toMatchObject({ code: "taken" });
		const [row] = await db
			.select()
			.from(socialHandle)
			.where(eq(socialHandle.handle, h("race")));
		expect([bob, carol]).toContain(row?.userId);
	});

	test("refuses a second change within 30 days", async () => {
		await expectSocialError(claimHandle(alice, h("alice2"), "Alice"), "cooldown");
		const check = await checkHandleAvailability(alice, h("alice2"));
		expect(check).toMatchObject({ available: false, reason: "cooldown" });
		expect((check as { retryAfterDays?: number }).retryAfterDays).toBeGreaterThan(0);
	});

	test("re-confirming the current handle is not a change", async () => {
		await claimHandle(alice, h("ALICE"), "Alice Renamed");
		expect((await getOwnProfile(alice))?.name).toBe("Alice Renamed");
	});

	test("a released handle is held for 90 days, reclaimable by the previous owner only", async () => {
		const later = new Date(Date.now() + 31 * DAY_MS);
		await claimHandle(alice, h("alice_new"), "Alice", later);
		const [old] = await db
			.select()
			.from(socialHandle)
			.where(eq(socialHandle.handle, h("alice")));
		expect(old?.releasedAt).not.toBeNull();
		expect(old?.reclaimable).toBe(true);

		const soon = new Date(later.getTime() + 10 * DAY_MS);
		await expectSocialError(claimHandle(carol, h("alice"), "Carol", soon), "taken");
		// Alice is inside her own cooldown, so the check reports that first.
		const afterCooldown = new Date(later.getTime() + 31 * DAY_MS);
		await expect(checkHandleAvailability(alice, h("alice"), afterCooldown)).resolves.toEqual({
			available: true,
		});

		const expired = new Date(later.getTime() + 91 * DAY_MS);
		await expect(checkHandleAvailability(carol, h("alice"), expired)).resolves.toEqual({
			available: true,
		});
		await claimHandle(carol, h("alice"), "Carol", expired);
		expect((await getOwnProfile(carol))?.handle).toBe(h("alice"));
	});

	test("an admin reset blocks the previous owner from reclaiming", async () => {
		const at = resetAt;
		await forceResetHandle(carol, at);
		const profile = await getOwnProfile(carol);
		expect(profile?.handle).toBeNull();
		expect(profile?.handleChangedAt).toBeNull();
		await expectSocialError(claimHandle(carol, h("alice"), "Carol", at), "taken");
		// Carol can pick a different handle right away.
		await claimHandle(carol, h("carol"), "Carol", at);
		expect((await getOwnProfile(carol))?.handle).toBe(h("carol"));
	});

	test("profile fields and visibility persist; unknown visibility is rejected by the schema", async () => {
		await updateOwnProfile(bob, {
			bio: "Reads a lot",
			visibility: "friends",
			showStats: false,
		});
		const profile = await getOwnProfile(bob);
		expect(profile).toMatchObject({ bio: "Reads a lot", visibility: "friends", showStats: false });
		await expect(
			db.execute(sql`update social_profile set visibility = 'public' where user_id = ${bob}`),
		).rejects.toThrow();
	});

	test("deletion releases the handle without reclaim and the FK drops the owner", async () => {
		// Whoever won the race, Bob ends up with a handle of his own here: a
		// change if he won (past his cooldown by now), a first claim otherwise.
		await claimHandle(bob, h("bob"), "Bob", resetAt);
		await db.transaction((tx) => releaseHandlesForDeletedUser(tx, bob, afterReset));
		await db.delete(user).where(eq(user.id, bob));
		const [row] = await db
			.select()
			.from(socialHandle)
			.where(eq(socialHandle.handle, h("bob")));
		expect(row).toMatchObject({ userId: null, reclaimable: false });
		expect(row?.releasedAt).not.toBeNull();
		const inHold = new Date(afterReset.getTime() + DAY_MS);
		await expectSocialError(claimHandle(carol, h("bob"), "Carol", inHold), "taken");
		expect(await db.select().from(socialProfile).where(eq(socialProfile.userId, bob))).toHaveLength(
			0,
		);
	});
});
