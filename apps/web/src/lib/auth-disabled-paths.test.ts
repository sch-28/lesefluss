import { describe, expect, it } from "vitest";
import { DISABLED_AUTH_PATHS } from "./auth-disabled-paths";

describe("DISABLED_AUTH_PATHS", () => {
	it("keeps every route off that deletes a user or lets a session alone write account rows", () => {
		expect(DISABLED_AUTH_PATHS).toEqual(
			expect.arrayContaining([
				"/delete-user",
				"/admin/remove-user",
				"/link-social",
				"/unlink-account",
				"/get-access-token",
				"/refresh-token",
				"/account-info",
				"/list-accounts",
			]),
		);
	});
});
