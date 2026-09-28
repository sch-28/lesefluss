import { afterEach, describe, expect, test } from "vitest";
import { originKey } from "./origin";

describe("originKey", () => {
	const saved = { ...process.env };
	const restore = (name: "ORIGIN_KEY_SECRET" | "BETTER_AUTH_SECRET") => {
		// Assigning undefined would store the string "undefined".
		if (saved[name] === undefined) delete process.env[name];
		else process.env[name] = saved[name];
	};
	afterEach(() => {
		restore("ORIGIN_KEY_SECRET");
		restore("BETTER_AUTH_SECRET");
	});

	test("is stable for equal origins, differs for others, and never contains the ids", () => {
		process.env.ORIGIN_KEY_SECRET = "s1";
		const a = originKey({ originUserId: "user-one", originBookId: "aaaa1111" });
		expect(a).toBe(originKey({ originUserId: "user-one", originBookId: "aaaa1111" }));
		expect(a).not.toBe(originKey({ originUserId: "user-two", originBookId: "aaaa1111" }));
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(a).not.toContain("user-one");
	});

	test("derives a key from the auth secret when no dedicated one is set", () => {
		delete process.env.ORIGIN_KEY_SECRET;
		process.env.BETTER_AUTH_SECRET = "auth";
		const derived = originKey({ originUserId: "u", originBookId: "b" });
		process.env.ORIGIN_KEY_SECRET = "s1";
		expect(originKey({ originUserId: "u", originBookId: "b" })).not.toBe(derived);
	});
});
