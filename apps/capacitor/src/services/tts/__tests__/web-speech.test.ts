import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TtsPlugin } from "../index";
import { createWebSpeechTts } from "../web-speech";

type FakeUtterance = {
	text: string;
	rate: number;
	pitch: number;
	lang: string;
	voice: SpeechSynthesisVoice | null;
	onstart: (() => void) | null;
	onboundary: ((e: { name?: string; charIndex: number }) => void) | null;
	onend: (() => void) | null;
	onerror: ((e: { error: string }) => void) | null;
};

const VOICES = [
	{ voiceURI: "local-de", name: "Anna", lang: "de-DE", localService: true },
	{ voiceURI: "google-en", name: "Google US English", lang: "en_US", localService: false },
] as unknown as SpeechSynthesisVoice[];

let spoken: FakeUtterance[];
let cancels: number;
let voices: SpeechSynthesisVoice[];
let voicesChanged: Set<() => void>;
let now: number;
let tts: TtsPlugin;
let events: { event: string; data: unknown }[];

const synth = {
	speak: (u: FakeUtterance) => spoken.push(u),
	cancel: () => {
		cancels++;
		// Browsers report the cancelled utterance as interrupted.
		spoken.at(-1)?.onerror?.({ error: "interrupted" });
	},
	getVoices: () => voices,
	addEventListener: (_: string, cb: () => void) => voicesChanged.add(cb),
	removeEventListener: (_: string, cb: () => void) => voicesChanged.delete(cb),
};

const last = () => spoken.at(-1) as FakeUtterance;
const progress = () =>
	events
		.filter((e) => e.event === "progress")
		.map((e) => e.data as { segmentId: number; charStart: number });
const states = () =>
	events
		.filter((e) => e.event === "state")
		.map((e) => e.data as { reason: string; isPlaying: boolean });

const seg = (id: number, text: string, opensChapter = false) => ({
	id,
	text,
	chapter: opensChapter ? `Chapter ${id}` : null,
	opensChapter,
});

async function start(segments = [seg(1, "One two three."), seg(2, "Four five.")], isLast = true) {
	await tts.start({ segments, isLast, title: "Book", rate: 1, pitch: 1, rewindWords: 8 });
}

beforeEach(async () => {
	vi.useFakeTimers();
	spoken = [];
	cancels = 0;
	voices = VOICES;
	voicesChanged = new Set();
	now = 1_000;
	events = [];
	tts = createWebSpeechTts({
		synth: synth as unknown as SpeechSynthesis,
		createUtterance: (text) =>
			({ text, rate: 1, pitch: 1, lang: "", voice: null }) as unknown as SpeechSynthesisUtterance,
		now: () => now,
	});
	for (const event of ["progress", "state", "needMore", "finished", "sleepTimer"] as const) {
		await tts.addListener(event, (data: unknown) => events.push({ event, data }));
	}
});

afterEach(() => vi.useRealTimers());

describe("createWebSpeechTts", () => {
	it("speaks segment by segment and reports each word boundary", async () => {
		await start();
		expect(last().text).toBe("One two three.");
		last().onstart?.();
		last().onboundary?.({ name: "word", charIndex: 4 });
		last().onboundary?.({ name: "sentence", charIndex: 0 });
		last().onend?.();
		expect(last().text).toBe("Four five.");
		last().onstart?.();
		expect(progress()).toEqual([
			{ segmentId: 1, charStart: 0 },
			{ segmentId: 1, charStart: 4 },
			{ segmentId: 2, charStart: 0 },
		]);
		expect(states()).toEqual([{ isPlaying: true, reason: "user" }]);
	});

	it("follows sentence by sentence with a voice that reports no boundaries", async () => {
		await start();
		last().onstart?.();
		last().onend?.();
		last().onstart?.();
		expect(progress().map((p) => p.segmentId)).toEqual([1, 2]);
	});

	it("pauses by cancelling and resumes at the last word heard", async () => {
		await start();
		last().onstart?.();
		last().onboundary?.({ name: "word", charIndex: 8 });
		await tts.pause();
		expect(states().at(-1)).toEqual({ isPlaying: false, reason: "user" });
		expect(cancels).toBeGreaterThan(0);
		// The cancelled utterance's late end must not advance the queue.
		spoken[0].onend?.();
		expect(await tts.getState()).toEqual({ segmentId: 1, charStart: 8 });
		await tts.resume();
		expect(last().text).toBe("three.");
		last().onboundary?.({ name: "word", charIndex: 0 });
		expect(progress().at(-1)).toEqual({ segmentId: 1, charStart: 8 });
	});

	it("logs what was spoken as intervals, the running one as a snapshot", async () => {
		await start();
		last().onstart?.();
		now = 3_000;
		last().onboundary?.({ name: "word", charIndex: 8 });
		await tts.pause();
		await tts.resume();
		now = 4_000;
		last().onend?.();
		last().onstart?.();
		now = 5_000;
		const { intervals } = await tts.drainListenLog();
		expect(intervals).toEqual([
			{
				startedAt: 1_000,
				endedAt: 3_000,
				startSegment: 1,
				startChar: 0,
				endSegment: 1,
				endChar: 8,
			},
			{
				startedAt: 3_000,
				endedAt: 5_000,
				startSegment: 1,
				startChar: 8,
				endSegment: 2,
				endChar: 0,
			},
		]);
		expect((await tts.drainListenLog()).intervals).toHaveLength(1);
	});

	it("asks for more text near the end of the queue and goes on once it arrives", async () => {
		await start([seg(1, "One.")], false);
		expect(events.filter((e) => e.event === "needMore")).toHaveLength(1);
		last().onend?.();
		expect(spoken).toHaveLength(1);
		await tts.append({ segments: [seg(2, "Two.")], isLast: true });
		expect(last().text).toBe("Two.");
	});

	it("ends at the end of the text", async () => {
		await start([seg(1, "One.")]);
		last().onend?.();
		expect(states().at(-1)).toEqual({ isPlaying: false, reason: "end" });
		expect(events.at(-1)?.event).toBe("finished");
	});

	it("pauses for the sleep timer, after a duration or where the next chapter opens", async () => {
		await start([seg(1, "One."), seg(2, "Two.", true)]);
		await tts.setSleepTimer({ durationMs: 60_000 });
		expect(events.at(-1)).toEqual({
			event: "sleepTimer",
			data: { endsAt: 61_000, isAtChapterEnd: false },
		});
		vi.advanceTimersByTime(60_000);
		expect(states().at(-1)).toEqual({ isPlaying: false, reason: "sleep" });

		await tts.resume();
		await tts.setSleepTimer({ isAtChapterEnd: true });
		last().onend?.();
		expect(states().at(-1)).toEqual({ isPlaying: false, reason: "sleep" });
		expect(progress().at(-1)).toEqual({ segmentId: 2, charStart: 0 });
	});

	it("gives up on an error speech cannot recover from, and skips a single failed segment", async () => {
		await start();
		last().onerror?.({ error: "synthesis-failed" });
		expect(last().text).toBe("Four five.");
		last().onerror?.({ error: "not-allowed" });
		expect(states().at(-1)).toEqual({ isPlaying: false, reason: "error" });
	});

	it("restarts the sentence on skip back, and the previous one right after it began", async () => {
		await start();
		last().onend?.();
		last().onstart?.();
		await tts.skip({ direction: -1 });
		expect(last().text).toBe("One two three.");
		now += 5_000;
		last().onboundary?.({ name: "word", charIndex: 4 });
		await tts.skip({ direction: -1 });
		expect(last().text).toBe("One two three.");
	});

	it("applies speed, pitch, voice and language to the utterance", async () => {
		await tts.start({
			segments: [seg(1, "Eins.")],
			isLast: true,
			title: "Buch",
			language: "de-DE",
			rate: 20,
			pitch: 1.2,
			voice: "local-de",
			rewindWords: 8,
		});
		expect(last()).toMatchObject({ rate: 10, pitch: 1.2, lang: "de-DE", voice: VOICES[0] });
	});

	it("lists every voice, local ones as offline, and checks a language by its primary tag", async () => {
		const { voices: listed } = await tts.getVoices();
		expect(listed).toEqual([
			{ name: "local-de", language: "de-DE", quality: 400, isNetwork: false, isInstalled: true },
			{ name: "google-en", language: "en-US", quality: 300, isNetwork: true, isInstalled: true },
		]);
		expect((await tts.checkLanguage({ language: "de-AT" })).status).toBe("available");
		expect((await tts.checkLanguage({ language: "fr" })).status).toBe("unsupported");
	});

	it("waits for the voice list before speaking, and does not play if stopped meanwhile", async () => {
		voices = [];
		const starting = start();
		await tts.stop();
		vi.advanceTimersByTime(2_000);
		await starting;
		expect(spoken).toHaveLength(0);

		voices = [];
		const again = start();
		voices = VOICES;
		for (const cb of [...voicesChanged]) cb();
		await again;
		expect(last().text).toBe("One two three.");
	});

	it("keeps a pause made while the voice list loads, and resumes from the start word", async () => {
		voices = [];
		const starting = start();
		await tts.pause();
		vi.advanceTimersByTime(2_000);
		await starting;
		expect(spoken).toHaveLength(0);
		expect(states().at(-1)).toEqual({ isPlaying: false, reason: "user" });
		await tts.resume();
		expect(last().text).toBe("One two three.");
	});
});
