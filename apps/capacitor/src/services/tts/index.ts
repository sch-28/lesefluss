import { Capacitor, type PluginListenerHandle, registerPlugin } from "@capacitor/core";
import type { WordIndex, WordPosition } from "@lesefluss/core";
import { createFakeTts, isFakeTtsRequested } from "../../test-hooks/tts";
import { log } from "../../utils/log";
import type { ListenInterval } from "./listen-sessions";
import { loadBaseline, rateFor } from "./pace";
import { buildSegments, type SpeechSegment, wordAtChar } from "./segments";

export type PauseReason = "user" | "focus" | "noisy" | "sleep" | "end" | "stopped" | "error";

export type TtsVoice = {
	name: string;
	/** BCP 47 tag, e.g. "de-DE". */
	language: string;
	/** Android `Voice.QUALITY_*`: 100 low to 500 very high. */
	quality: number;
	isNetwork: boolean;
	isInstalled: boolean;
};

export type LanguageStatus = "available" | "missingData" | "unsupported";

/** Speech settings as the reader states them: speed in words per minute. */
export type ReadAloudSpeech = {
	wpm: number;
	pitch: number;
	voice: string | null;
	rewindWords: number;
};

export type SpeechOptions = {
	rate: number;
	pitch: number;
	voice: string | null;
	rewindWords: number;
};

type WireSegment = { id: number; text: string; chapter: string | null; opensChapter: boolean };

type NativeInterval = {
	startedAt: number;
	endedAt: number;
	startSegment: number;
	startChar: number;
	endSegment: number;
	endChar: number;
};

type TtsEvents = {
	progress: { segmentId: number; charStart: number };
	state: { isPlaying: boolean; reason: PauseReason };
	needMore: Record<string, never>;
	finished: Record<string, never>;
	sleepTimer: { endsAt: number; isAtChapterEnd: boolean };
};

export interface TtsPlugin {
	start(
		options: {
			segments: WireSegment[];
			isLast: boolean;
			title: string;
			author?: string;
			cover?: string;
			language?: string;
		} & NativeSpeechOptions,
	): Promise<void>;
	append(options: { segments: WireSegment[]; isLast: boolean }): Promise<void>;
	pause(): Promise<void>;
	resume(): Promise<void>;
	stop(): Promise<void>;
	skip(options: { direction: 1 | -1 }): Promise<void>;
	setOptions(options: NativeSpeechOptions): Promise<void>;
	setSleepTimer(options: { durationMs?: number; isAtChapterEnd?: boolean }): Promise<void>;
	getState(): Promise<{ segmentId: number; charStart: number }>;
	drainListenLog(): Promise<{ intervals: NativeInterval[] }>;
	getVoices(): Promise<{ voices: TtsVoice[] }>;
	checkLanguage(options: { language: string }): Promise<{ status: LanguageStatus }>;
	speakSample(options: { text: string; language?: string } & NativeSpeechOptions): Promise<void>;
	openSystemSettings(): Promise<void>;
	installVoiceData(): Promise<void>;
	addListener<E extends keyof TtsEvents>(
		event: E,
		cb: (data: TtsEvents[E]) => void,
	): Promise<PluginListenerHandle>;
}

type NativeSpeechOptions = { rate: number; pitch: number; voice?: string; rewindWords: number };

const isFakeTts = import.meta.env.DEV && isFakeTtsRequested();
const TtsNative = isFakeTts ? createFakeTts() : registerPlugin<TtsPlugin>("Tts");

export const IS_READ_ALOUD_SUPPORTED = Capacitor.getPlatform() === "android" || isFakeTts;

// Enough text to keep talking for about half an hour if the WebView stops
// running JS in the background and cannot answer `needMore`.
const BATCH_SEGMENTS = 300;
const APPEND_ATTEMPTS = 3;
const APPEND_RETRY_MS = 1000;

function toNative(options: SpeechOptions): NativeSpeechOptions {
	return {
		rate: options.rate,
		pitch: options.pitch,
		voice: options.voice ?? undefined,
		rewindWords: options.rewindWords,
	};
}

export type SleepTimer = { endsAt: number | null; isAtChapterEnd: boolean };

type ReadAloudOptions = {
	content: string;
	wordIndex: WordIndex;
	chapters: readonly { title: string; startWord: number }[];
	startWord: number;
	title: string;
	author: string | null;
	cover: string | null;
	language: string | null;
	speech: SpeechOptions;
	onWord: (word: WordPosition) => void;
	onPlayingChange: (isPlaying: boolean, reason: PauseReason) => void;
	onFinished: () => void;
	onSleepTimerChange: (timer: SleepTimer) => void;
};

// Segment ids stay unique across sessions so a late event from a stopped
// session never maps onto the new one's text.
let nextSegmentId = 0;

// Every segment sent, across sessions until released: the listen log reports
// intervals that may start many segments back, after JS was frozen in the
// background, or belong to a session "read from here" just replaced.
const sentSegments = new Map<number, SpeechSegment>();

function wordOfSegment(segmentId: number, charStart: number): WordPosition | null {
	const segment = sentSegments.get(segmentId);
	return segment ? wordAtChar(segment, charStart) : null;
}

/** Playback since the last drain, in word positions, whichever session spoke it. */
export async function drainListenLog(): Promise<ListenInterval[]> {
	const { intervals } = await TtsNative.drainListenLog();
	return intervals.flatMap((i) => {
		const startWord = wordOfSegment(i.startSegment, i.startChar);
		const endWord = wordOfSegment(i.endSegment, i.endChar);
		if (startWord === null || endWord === null) return [];
		return [{ startedAt: i.startedAt, endedAt: i.endedAt, startWord, endWord }];
	});
}

/** One read-aloud session over a book, from a start word to the end or `stop()`. */
export class ReadAloud {
	private readonly options: ReadAloudOptions;
	private readonly segmentIds: number[] = [];
	private readonly listeners: Promise<PluginListenerHandle>[] = [];
	private nextWord: number;
	private isStopped = false;

	constructor(options: ReadAloudOptions) {
		this.options = options;
		this.nextWord = options.startWord;
	}

	async start(): Promise<void> {
		const { options } = this;
		if (this.isStopped) return;
		this.listen("progress", ({ segmentId, charStart }) => {
			const word = this.wordAt(segmentId, charStart);
			if (word !== null) options.onWord(word);
		});
		this.listen("state", ({ isPlaying, reason }) => options.onPlayingChange(isPlaying, reason));
		this.listen("needMore", () => void this.appendBatch());
		this.listen("finished", () => options.onFinished());
		this.listen("sleepTimer", ({ endsAt, isAtChapterEnd }) =>
			options.onSleepTimerChange({ endsAt: endsAt > 0 ? endsAt : null, isAtChapterEnd }),
		);
		await Promise.all(this.listeners);
		// Replaced before it got going: the next session owns the engine.
		if (this.isStopped) return;
		const batch = this.takeBatch();
		await TtsNative.start({
			...batch,
			title: options.title,
			author: options.author ?? undefined,
			cover: options.cover ?? undefined,
			language: options.language ?? undefined,
			...toNative(options.speech),
		});
	}

	pause(): Promise<void> {
		return TtsNative.pause();
	}

	resume(): Promise<void> {
		return TtsNative.resume();
	}

	skip(direction: 1 | -1): Promise<void> {
		return TtsNative.skip({ direction });
	}

	setSpeech(speech: SpeechOptions): Promise<void> {
		return TtsNative.setOptions(toNative(speech));
	}

	setSleepTimer(timer: { durationMs: number } | { isAtChapterEnd: true } | null): Promise<void> {
		return TtsNative.setSleepTimer(timer ?? {});
	}

	/** Where the voice is now; null once nothing is loaded. */
	async currentWord(): Promise<WordPosition | null> {
		const state = await TtsNative.getState();
		return this.wordAt(state.segmentId, state.charStart);
	}

	async stop(): Promise<void> {
		if (this.isStopped) return;
		this.isStopped = true;
		for (const listener of this.listeners) void listener.then((handle) => handle.remove());
		this.listeners.length = 0;
		await TtsNative.stop();
	}

	private listen<E extends keyof TtsEvents>(event: E, handler: (data: TtsEvents[E]) => void): void {
		this.listeners.push(
			TtsNative.addListener(event, (data) => {
				// Listener removal is async, so a late event can still arrive after stop().
				if (!this.isStopped) handler(data);
			}),
		);
	}

	/** Forgets this session's text once its listening has been recorded. */
	release(): void {
		for (const id of this.segmentIds) sentSegments.delete(id);
		this.segmentIds.length = 0;
	}

	private wordAt(segmentId: number, charStart: number): WordPosition | null {
		return this.segmentIds.length > 0 ? wordOfSegment(segmentId, charStart) : null;
	}

	private async appendBatch(): Promise<void> {
		if (this.isStopped) return;
		const batch = this.takeBatch();
		// The engine asks for more only once; a lost batch would end playback at this point.
		for (let attempt = 1; ; attempt++) {
			try {
				await TtsNative.append(batch);
				return;
			} catch (err) {
				if (this.isStopped || attempt >= APPEND_ATTEMPTS) {
					log.error("tts", "append failed:", err);
					return;
				}
				await new Promise((resolve) => setTimeout(resolve, APPEND_RETRY_MS));
			}
		}
	}

	private takeBatch(): { segments: WireSegment[]; isLast: boolean } {
		const { content, wordIndex, chapters, language } = this.options;
		const built = buildSegments(
			{ content, wordIndex, chapters, language },
			this.nextWord,
			nextSegmentId,
			BATCH_SEGMENTS,
			this.segmentIds.length === 0,
		);
		for (const segment of built) {
			sentSegments.set(segment.id, segment);
			this.segmentIds.push(segment.id);
		}
		const last = built.at(-1);
		if (last) {
			nextSegmentId = last.id + 1;
			this.nextWord = last.endWord;
		}
		return {
			segments: built.map(({ id, text, chapter, opensChapter }) => ({
				id,
				text,
				chapter,
				opensChapter,
			})),
			isLast: this.nextWord >= wordIndex.wordCount,
		};
	}
}

const logFailure = (action: string) => (err: unknown) => log.warn("tts", `${action} failed:`, err);

/** Engine actions behind buttons: a failure is logged, the button simply does nothing. */
export const ttsEngine = {
	getVoices: () => TtsNative.getVoices(),
	checkLanguage: (language: string) => TtsNative.checkLanguage({ language }),
	speakSample: (text: string, language: string | null, speech: ReadAloudSpeech) =>
		TtsNative.speakSample({
			text,
			language: language ?? undefined,
			...toNative({ ...speech, rate: rateFor(speech.wpm, loadBaseline(speech.voice)) }),
		}).catch(logFailure("sample")),
	openSystemSettings: () => TtsNative.openSystemSettings().catch(logFailure("open settings")),
	installVoiceData: () => TtsNative.installVoiceData().catch(logFailure("voice download")),
};
