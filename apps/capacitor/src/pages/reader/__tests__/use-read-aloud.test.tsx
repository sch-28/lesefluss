import { WordIndex } from "@lesefluss/core";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

type SessionOptions = {
	startWord: number;
	onWord: (word: number) => void;
	onPlayingChange: (isPlaying: boolean, reason: string) => void;
};

const sessions: FakeSession[] = [];
class FakeSession {
	readonly resume = vi.fn(async () => {});
	/** Where the native engine says it is, for the catch-up after an app switch. */
	position = 0;
	constructor(readonly options: SessionOptions) {
		sessions.push(this);
	}
	start = async () => {};
	pause = async () => {};
	stop = async () => {};
	release = () => {};
	skip = async () => {};
	setSpeech = async () => {};
	setSleepTimer = async () => {};
	currentWord = async () => this.position;
}

let appStateListener: ((state: { isActive: boolean }) => void) | null = null;
vi.mock("../../../services/tts", () => ({
	ReadAloud: FakeSession,
	drainListenLog: async () => ({ intervals: [] }),
	ttsEngine: { checkLanguage: async () => ({ status: "available" }) },
}));
vi.mock("../../../services/reading-sessions/persist", () => ({ persistRow: () => {} }));
vi.mock("@capacitor/app", () => ({
	App: {
		addListener: (_event: string, cb: (state: { isActive: boolean }) => void) => {
			appStateListener = cb;
			return Promise.resolve({ remove: () => {} });
		},
	},
}));

const { useReadAloud } = await import("../use-read-aloud");

type Hook = ReturnType<typeof useReadAloud>;
let hook: Hook | null = null;
const saved: number[] = [];
const reported: number[] = [];
const detachedStops: number[] = [];
let beforeStarts = 0;
let backToVoice = 0;
const content = Array.from({ length: 100 }, (_, i) => `w${i}`).join(" ");
const wordIndex = WordIndex.build(content);

function Probe() {
	hook = useReadAloud({
		bookId: "b1",
		content,
		wordIndex,
		chapters: [],
		title: "T",
		author: null,
		cover: null,
		language: null,
		speech: { wpm: 200, pitch: 1, voice: null, rewindWords: 0 },
		getStartWord: () => 10,
		getViewWord: () => 50,
		onWord: (word) => reported.push(word),
		onSavePosition: (word) => saved.push(word),
		onStopWhileDetached: (word) => detachedStops.push(word),
		onBeforeStart: () => beforeStarts++,
		onBackToVoice: () => backToVoice++,
	});
	return null;
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	hook = null;
	appStateListener = null;
	sessions.length = 0;
	saved.length = 0;
	reported.length = 0;
	detachedStops.length = 0;
	beforeStarts = 0;
	backToVoice = 0;
});

const session = () => {
	const last = sessions.at(-1);
	if (!last) throw new Error("No session started");
	return last;
};

/** Starts listening at word 10, speaks word 12 and, if asked, pauses there (as the engine reports it). */
async function listenTo12({ pause }: { pause: boolean }) {
	view = await render(<Probe />);
	act(() => hook?.toggle());
	act(() => session().options.onWord(12));
	if (pause) act(() => session().options.onPlayingChange(false, "user"));
	return session();
}

/** The reader moves the view to word 40; returns whether the voice keeps the position. */
function readerMovesTo40() {
	let keeps: boolean | undefined;
	act(() => {
		keeps = hook?.keepsPositionOnMove(40);
	});
	return keeps;
}

/** Clears what was recorded so far, so a test asserts only on what follows. */
function clearRecords() {
	saved.length = 0;
	reported.length = 0;
	detachedStops.length = 0;
}

describe("useReadAloud, playing", () => {
	it("keeps the position with the voice when the reader moves", async () => {
		await listenTo12({ pause: false });
		expect(readerMovesTo40()).toBe(true);
		expect(hook?.ownsPosition()).toBe(true);
	});

	it("stopped after the reader looked away, saves the spoken word and hands back the view", async () => {
		await listenTo12({ pause: false });
		readerMovesTo40();
		clearRecords();

		await act(async () => hook?.stop());

		expect(saved).toEqual([12]);
		expect(detachedStops).toEqual([40]);
	});

	it("paused while the reader looked away, saves the spoken word and hands back the view", async () => {
		const playing = await listenTo12({ pause: false });
		readerMovesTo40();
		clearRecords();

		act(() => playing.options.onPlayingChange(false, "sleep"));

		expect(saved).toEqual([12]);
		expect(detachedStops).toEqual([40]);
	});

	it("resumed by the system after a pause while the reader only glanced away, carries on following the voice", async () => {
		const playing = await listenTo12({ pause: false });
		readerMovesTo40();
		act(() => playing.options.onPlayingChange(false, "focus"));

		act(() => playing.options.onPlayingChange(true, "user"));

		expect(backToVoice).toBe(1);
		expect(session()).toBe(playing);
	});

	it("catching up after an app switch while paused away doesn't pull the view back", async () => {
		const playing = await listenTo12({ pause: false });
		readerMovesTo40();
		act(() => playing.options.onPlayingChange(false, "user"));
		clearRecords();
		playing.position = 30;

		await act(async () => appStateListener?.({ isActive: true }));

		expect(reported).toEqual([]);
	});

	it("starts only after a reader browsing elsewhere commits that spot", async () => {
		view = await render(<Probe />);
		act(() => hook?.toggle());
		expect(beforeStarts).toBe(1);
	});
});

describe("useReadAloud, paused and the reader moved", () => {
	it("hands the position to the reader: a stop saves nothing over it", async () => {
		await listenTo12({ pause: true });
		expect(readerMovesTo40()).toBe(false);
		clearRecords();

		await act(async () => hook?.stop());

		expect(hook?.ownsPosition()).toBe(false);
		expect(saved).toEqual([]);
		expect(detachedStops).toEqual([]);
	});

	it("saves and reports nothing from the engine catching up after an app switch", async () => {
		const paused = await listenTo12({ pause: true });
		readerMovesTo40();
		clearRecords();
		paused.position = 30;

		await act(async () => appStateListener?.({ isActive: true }));

		expect(saved).toEqual([]);
		expect(reported).toEqual([]);
	});

	it("saves nothing when a sleep timer or a refused resume reports another pause", async () => {
		const paused = await listenTo12({ pause: true });
		readerMovesTo40();
		clearRecords();

		act(() => paused.options.onPlayingChange(false, "sleep"));
		act(() => paused.options.onPlayingChange(false, "focus"));

		expect(saved).toEqual([]);
		expect(detachedStops).toEqual([]);
	});

	it("saves and reports nothing from a skip", async () => {
		const paused = await listenTo12({ pause: true });
		readerMovesTo40();
		clearRecords();

		act(() => paused.options.onWord(25));

		expect(saved).toEqual([]);
		expect(reported).toEqual([]);
	});

	it("play reads from the reader's word", async () => {
		const paused = await listenTo12({ pause: true });
		readerMovesTo40();

		act(() => hook?.toggle());

		expect(paused.resume).not.toHaveBeenCalled();
		expect(session().options.startWord).toBe(40);
	});

	it("a resume by the system (earbuds, notification) also reads from the reader's word", async () => {
		const paused = await listenTo12({ pause: true });
		readerMovesTo40();
		clearRecords();

		// The engine reports its cursor before it reports playing again.
		act(() => paused.options.onWord(13));
		act(() => paused.options.onPlayingChange(true, "user"));

		expect(reported).toEqual([]);
		expect(session()).not.toBe(paused);
		expect(session().options.startWord).toBe(40);
	});

	it("back to the voice makes the spoken word the position again", async () => {
		await listenTo12({ pause: true });
		readerMovesTo40();
		clearRecords();

		act(() => hook?.resumeFollowing());

		expect(hook?.ownsPosition()).toBe(true);
		expect(saved).toEqual([12]);
	});

	it("a jump moves only the view and leaves the voice paused", async () => {
		await listenTo12({ pause: true });

		let voiceTookIt: boolean | undefined;
		act(() => {
			voiceTookIt = hook?.moveTo(70);
		});

		expect(voiceTookIt).toBe(false);
		expect(sessions).toHaveLength(1);
		expect(hook?.ownsPosition()).toBe(false);
	});
});

describe("useReadAloud, paused without a move", () => {
	it("play resumes where the voice was", async () => {
		const paused = await listenTo12({ pause: true });

		act(() => hook?.toggle());

		expect(paused.resume).toHaveBeenCalled();
		expect(sessions).toHaveLength(1);
	});
});
