import { describe, expect, it, vi } from "vitest";

vi.mock("../../sync/auth-client", () => ({
	SYNC_URL: "https://lesefluss.app",
	syncAuthClient: null,
}));

import { inviteRoute, parseDeepLink, parsePastedInvite } from "../parse";

const TOKEN = "Ab3dEf7hIj9kLmNoPqRsTuVwXyZ0123456789_-abcd";

describe("parseDeepLink", () => {
	it("recognises an invite link", () => {
		expect(parseDeepLink(`https://lesefluss.app/invite/${TOKEN}`)).toEqual({
			kind: "invite",
			token: TOKEN,
		});
		expect(parseDeepLink(`https://lesefluss.app/invite/${TOKEN}/`)).toEqual({
			kind: "invite",
			token: TOKEN,
		});
	});

	it("ignores other hosts, schemes and unclaimed paths", () => {
		expect(parseDeepLink(`https://evil.example/invite/${TOKEN}`)).toBeNull();
		expect(parseDeepLink(`http://lesefluss.app/invite/${TOKEN}`)).toBeNull();
		expect(parseDeepLink("https://lesefluss.app/")).toBeNull();
		expect(parseDeepLink("https://lesefluss.app/app/tabs/library")).toBeNull();
		expect(parseDeepLink("https://lesefluss.app/download")).toBeNull();
		expect(parseDeepLink("lesefluss://auth-callback?state=x&token=y")).toBeNull();
		expect(parseDeepLink("not a url")).toBeNull();
	});

	it("treats a claimed path it does not understand as unknown", () => {
		expect(parseDeepLink("https://lesefluss.app/invite/")).toEqual({
			kind: "unknown-claimed",
			url: "https://lesefluss.app/invite/",
		});
		expect(parseDeepLink("https://lesefluss.app/invite/short")).toMatchObject({
			kind: "unknown-claimed",
		});
		expect(
			parseDeepLink("https://lesefluss.app/invite/with%20space%20and%20length%20padding"),
		).toMatchObject({
			kind: "unknown-claimed",
		});
		expect(parseDeepLink(`https://lesefluss.app/invite/${TOKEN}/extra`)).toMatchObject({
			kind: "unknown-claimed",
		});
	});
});

describe("parsePastedInvite", () => {
	it("finds the link inside surrounding text", () => {
		expect(parsePastedInvite(`Join me: https://lesefluss.app/invite/${TOKEN} see you!`)).toEqual({
			kind: "invite",
			token: TOKEN,
		});
	});

	it("returns null for text without a valid invite link", () => {
		expect(parsePastedInvite("hello there")).toBeNull();
		expect(parsePastedInvite("https://lesefluss.app/download")).toBeNull();
		expect(parsePastedInvite("")).toBeNull();
	});
});

describe("inviteRoute", () => {
	it("builds the in-app route", () => {
		expect(inviteRoute(TOKEN)).toBe(`/tabs/social/invite/${TOKEN}`);
	});
});
