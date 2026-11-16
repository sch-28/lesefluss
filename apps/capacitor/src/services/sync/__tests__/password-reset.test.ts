import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth-client", () => ({ SYNC_URL: "https://sync.test" }));

const { requestPasswordReset, PasswordResetError } = await import("../password-reset");

afterEach(() => vi.unstubAllGlobals());

describe("requestPasswordReset", () => {
	it("asks the server to mail a link that lands on the website's reset page", async () => {
		const fetchMock = vi.fn(async () => Response.json({ status: true }));
		vi.stubGlobal("fetch", fetchMock);

		await requestPasswordReset("reader@example.com");

		expect(fetchMock).toHaveBeenCalledWith("https://sync.test/api/auth/request-password-reset", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "reader@example.com", redirectTo: "/reset-password" }),
		});
	});

	it.each([
		[429, "rate-limited"],
		[500, "unknown"],
	] as const)("maps a %i to %s", async (status, reason) => {
		vi.stubGlobal("fetch", async () => new Response(null, { status }));
		await expect(requestPasswordReset("a@b.c")).rejects.toMatchObject({ reason });
	});

	it("reports a network failure as offline", async () => {
		vi.stubGlobal("fetch", async () => {
			throw new TypeError("Failed to fetch");
		});
		const err = await requestPasswordReset("a@b.c").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(PasswordResetError);
		expect((err as InstanceType<typeof PasswordResetError>).reason).toBe("offline");
	});
});
