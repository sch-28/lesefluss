import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { SyncPushSchema, SyncReadingSessionSchema, type SyncSettings } from "../sync";

type SessionInput = z.input<typeof SyncReadingSessionSchema>;

function session(overrides: Partial<SessionInput> = {}): SessionInput {
	return {
		sessionId: "abcd1234",
		bookId: "0123abcd",
		mode: "scroll" as const,
		startedAt: 1_000_000,
		endedAt: 1_660_000,
		durationMs: 660_000,
		wordsRead: 5,
		startWord: 0,
		endWord: 5,
		wpmAvg: 0,
		updatedAt: 1_660_000,
		...overrides,
	};
}

describe("SyncReadingSessionSchema", () => {
	it("accepts a session whose computed wpm rounds to zero", () => {
		expect(SyncReadingSessionSchema.safeParse(session()).success).toBe(true);
	});

	it("accepts a null wpm", () => {
		expect(SyncReadingSessionSchema.safeParse(session({ wpmAvg: null })).success).toBe(true);
	});

	it("still rejects a negative wpm", () => {
		expect(SyncReadingSessionSchema.safeParse(session({ wpmAvg: -1 })).success).toBe(false);
	});

	it("still rejects a session that ends before it starts", () => {
		const bad = session({ startedAt: 2_000_000, endedAt: 1_000_000 });
		expect(SyncReadingSessionSchema.safeParse(bad).success).toBe(false);
	});
});

describe("SyncPushSchema settings", () => {
	const settings = {
		wpm: 350,
		delayComma: 2,
		delayPeriod: 3,
		accelStart: 2,
		accelRate: 0.1,
		xOffset: 30,
		focalLetterColor: "#ff0000",
		wordOffset: 5,
		readerTheme: "sepia",
		readerFontSize: 16,
		readerFontFamily: "serif",
		readerBold: true,
		readerTextAlign: "justify",
		readerLineSpacing: 1.8,
		readerMargin: 20,
		readerLetterSpacing: 0.04,
		readerWordSpacing: 0.16,
		readerParagraphSpacing: 1.6,
		showReadingTime: true,
		readerActiveWordUnderline: false,
		readerGlossaryUnderline: true,
		defaultReaderMode: "scroll",
		paginationStyle: "page",
		updatedAt: 1_700_000_000_000,
	} satisfies SyncSettings;
	const book = {
		bookId: "deadbeef",
		title: "Test",
		author: null,
		fileSize: 100,
		wordCount: 50,
		wordPosition: 7,
		updatedAt: 1_700_000_000_000,
	};

	function push(s: Record<string, unknown>) {
		return SyncPushSchema.safeParse({ books: [book], settings: s, highlights: [] });
	}

	it("drops an unknown enum value and keeps the rest of the push", () => {
		const result = push({ ...settings, readerFontFamily: "comic-neue", readerTheme: "contrast" });
		expect(result.success).toBe(true);
		expect(result.data?.books).toHaveLength(1);
		expect(result.data?.settings).not.toHaveProperty("readerFontFamily");
		expect(result.data?.settings).not.toHaveProperty("readerTheme");
		expect(result.data?.settings).toMatchObject({ wpm: 350, paginationStyle: "page" });
	});

	it("leaves an omitted field out instead of filling in its default", () => {
		const { readerActiveWordUnderline: _, ...older } = settings;
		const result = push(older);
		expect(result.success).toBe(true);
		expect(result.data?.settings).not.toHaveProperty("readerActiveWordUnderline");
	});

	it("keeps every valid field", () => {
		expect(push(settings).data?.settings).toEqual(settings);
	});

	it("ignores a field it doesn't know", () => {
		expect(push({ ...settings, readerHyphenation: "manual" }).data?.settings).toEqual(settings);
	});

	it("leaves the spacing fields out of a push from a client that predates them", () => {
		const {
			readerLetterSpacing: _l,
			readerWordSpacing: _w,
			readerParagraphSpacing: _p,
			...older
		} = settings;
		const pushed = push(older).data?.settings;
		expect(pushed).not.toHaveProperty("readerLetterSpacing");
		expect(pushed).not.toHaveProperty("readerWordSpacing");
		expect(pushed).not.toHaveProperty("readerParagraphSpacing");
	});

	it.each(["atkinson", "opendyslexic", "literata"])("keeps the %s reader font", (font) => {
		expect(push({ ...settings, readerFontFamily: font }).data?.settings).toMatchObject({
			readerFontFamily: font,
		});
	});

	it("drops a bold text value that isn't a boolean", () => {
		expect(push({ ...settings, readerBold: "yes" }).data?.settings).not.toHaveProperty(
			"readerBold",
		);
	});

	it("leaves bold text out of a push from a client that predates it", () => {
		const { readerBold: _, ...older } = settings;
		expect(push(older).data?.settings).not.toHaveProperty("readerBold");
	});

	it("drops an alignment it doesn't know, as a newer client might send", () => {
		expect(push({ ...settings, readerTextAlign: "center" }).data?.settings).not.toHaveProperty(
			"readerTextAlign",
		);
	});

	it("leaves the alignment out of a push from a client that predates it", () => {
		const { readerTextAlign: _, ...older } = settings;
		expect(push(older).data?.settings).not.toHaveProperty("readerTextAlign");
	});

	it("drops a spacing value outside its range and keeps the rest", () => {
		const pushed = push({ ...settings, readerLetterSpacing: 0.5, readerParagraphSpacing: 0 }).data
			?.settings;
		expect(pushed).not.toHaveProperty("readerLetterSpacing");
		expect(pushed).not.toHaveProperty("readerParagraphSpacing");
		expect(pushed).toMatchObject({ readerWordSpacing: 0.16 });
	});

	it("still rejects settings without a valid updatedAt", () => {
		expect(push({ ...settings, updatedAt: -1 }).success).toBe(false);
	});
});
