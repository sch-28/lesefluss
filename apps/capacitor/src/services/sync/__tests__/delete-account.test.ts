import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/preferences", () => ({
	Preferences: { get: vi.fn(async () => ({ value: null })), set: vi.fn(), remove: vi.fn() },
}));
vi.mock("../auth-client", () => ({ SYNC_URL: "https://lesefluss.app", syncAuthClient: null }));

const clearToken = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../session", async (importOriginal) => ({
	...(await importOriginal<typeof import("../session")>()),
	clearToken,
}));

const calls: Array<{ path: string; body: unknown }> = [];
let failWith: { status: number; body: unknown } | null = null;
vi.mock("../../authed-fetch", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../authed-fetch")>();
	return {
		...actual,
		authedFetch: vi.fn(async (path: string, options?: { body?: string }) => {
			calls.push({ path, body: options?.body ? JSON.parse(options.body) : null });
			if (failWith) {
				throw new actual.AuthedFetchError(
					failWith.status,
					JSON.stringify(failWith.body),
					failWith.body,
				);
			}
			return Response.json({ ok: true });
		}),
	};
});

const { AccountDeletionRefusedError, deleteAccount } = await import("../index");

beforeEach(() => {
	calls.length = 0;
	failWith = null;
	clearToken.mockClear();
});

describe("deleteAccount", () => {
	it("sends the password with the confirm literal, then clears the token", async () => {
		await deleteAccount("hunter22");
		expect(calls).toEqual([
			{ path: "/api/account/delete", body: { confirm: "delete-account", password: "hunter22" } },
		]);
		expect(clearToken).toHaveBeenCalledOnce();
	});

	it("sends no password field for an empty one", async () => {
		await deleteAccount("");
		expect(calls[0]?.body).toEqual({ confirm: "delete-account" });
	});

	it("turns a 403 refusal into AccountDeletionRefusedError and keeps the token", async () => {
		failWith = { status: 403, body: { error: "x", reason: "wrong_password" } };
		const err = await deleteAccount("nope").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(AccountDeletionRefusedError);
		expect((err as InstanceType<typeof AccountDeletionRefusedError>).reason).toBe("wrong_password");
		expect((err as Error).message).toBe("That password is not correct.");
		expect(clearToken).not.toHaveBeenCalled();
	});

	it("says to wait, not to check the connection, after too many attempts", async () => {
		failWith = { status: 429, body: null };
		const err = await deleteAccount("guess").catch((e: unknown) => e);
		expect((err as InstanceType<typeof AccountDeletionRefusedError>).reason).toBe("rate_limited");
		expect(clearToken).not.toHaveBeenCalled();
	});

	it("passes any other failure on as a plain error", async () => {
		failWith = { status: 500, body: { reason: "wrong_password" } };
		const err = await deleteAccount("hunter22").catch((e: unknown) => e);
		expect(err).not.toBeInstanceOf(AccountDeletionRefusedError);
		expect(clearToken).not.toHaveBeenCalled();
	});
});
