import type { PluginListenerHandle } from "@capacitor/core";
import type { PauseReason, TtsEvents, TtsPlugin, TtsVoice } from "./index";

type StartOptions = Parameters<TtsPlugin["start"]>[0];
type Segment = StartOptions["segments"][number];
type SpeechOptions = Parameters<TtsPlugin["setOptions"]>[0];
type Interval = Awaited<ReturnType<TtsPlugin["drainListenLog"]>>["intervals"][number];
type Listener = (data: unknown) => void;

export type SpeechHost = {
	synth: SpeechSynthesis;
	createUtterance: (text: string) => SpeechSynthesisUtterance;
	now: () => number;
};

const LOW_WATER_SEGMENTS = 40;
const RESTART_SENTENCE_WINDOW_MS = 2000;
const MAX_CONSECUTIVE_ERRORS = 3;
// Chrome fills the voice list only after `voiceschanged`; some browsers never fire it.
const VOICES_WAIT_MS = 1500;
// What the engine reports for an utterance we cancelled ourselves.
const OWN_CANCEL = new Set(["interrupted", "canceled"]);
// Speech is blocked or missing: the next utterance would fail the same way.
const FATAL_ERRORS = new Set(["not-allowed", "synthesis-unavailable", "audio-hardware"]);
// Web Speech has no quality rating; local voices go first, as on Android.
const LOCAL_QUALITY = 400;
const NETWORK_QUALITY = 300;

export function isWebSpeechAvailable(): boolean {
	return typeof window !== "undefined" && "speechSynthesis" in window;
}

function browserHost(): SpeechHost {
	return {
		synth: window.speechSynthesis,
		createUtterance: (text) => new SpeechSynthesisUtterance(text),
		now: Date.now,
	};
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const primaryLanguage = (tag: string) => tag.split(/[-_]/)[0]?.toLowerCase() ?? "";

/**
 * The Tts plugin over the browser's `speechSynthesis`, with the native player's
 * queue semantics: one utterance per segment, progress from word boundaries
 * (or each segment's start for voices that report none), `needMore` near the
 * end of the queue, a listen log and a sleep timer kept in JS.
 */
export function createWebSpeechTts(host: SpeechHost = browserHost()): TtsPlugin {
	const listeners = new Map<string, Set<Listener>>();
	const emit = <E extends keyof TtsEvents>(event: E, data: TtsEvents[E]) => {
		for (const listener of listeners.get(event) ?? []) listener(data);
	};

	let segments: Segment[] = [];
	let cursor = 0;
	let cursorChar = 0;
	let cursorStartedAt = 0;
	let isPlaying = false;
	let isEndOfText = false;
	let hasRequestedMore = false;
	let isWaitingForMore = false;
	let generation = 0;
	let loads = 0;
	/** A pause while start waits for the voice list must win over the start. */
	let isStarting = false;
	let consecutiveErrors = 0;
	// Held so Chrome does not collect a speaking utterance and drop its `end` event.
	let current: SpeechSynthesisUtterance | null = null;
	let speech: SpeechOptions = { rate: 1, pitch: 1, rewindWords: 0 };
	let language: string | undefined;
	let openInterval: Interval | null = null;
	const closedIntervals: Interval[] = [];
	let sleepTimeout: ReturnType<typeof setTimeout> | null = null;
	let sleepEndsAt = 0;
	let isSleepAtChapterEnd = false;

	const publishState = (playing: boolean, reason: PauseReason) =>
		emit("state", { isPlaying: playing, reason });

	const startInterval = () => {
		const segment = segments[cursor];
		if (!segment) return;
		const now = host.now();
		openInterval = {
			startedAt: now,
			endedAt: now,
			startSegment: segment.id,
			startChar: cursorChar,
			endSegment: segment.id,
			endChar: cursorChar,
		};
	};
	const updateInterval = () => {
		const segment = segments[cursor];
		if (!openInterval || !segment) return;
		openInterval.endedAt = host.now();
		openInterval.endSegment = segment.id;
		openInterval.endChar = cursorChar;
	};
	const closeInterval = () => {
		if (!openInterval) return;
		updateInterval();
		closedIntervals.push(openInterval);
		openInterval = null;
	};

	const reportCursor = () => {
		const segment = segments[cursor];
		if (segment) emit("progress", { segmentId: segment.id, charStart: cursorChar });
	};

	const clearSleepTimer = () => {
		if (sleepTimeout !== null) clearTimeout(sleepTimeout);
		sleepTimeout = null;
		const wasSet = isSleepAtChapterEnd || sleepEndsAt !== 0;
		sleepEndsAt = 0;
		isSleepAtChapterEnd = false;
		if (wasSet) emit("sleepTimer", { endsAt: 0, isAtChapterEnd: false });
	};

	const halt = () => {
		generation++;
		if (current) {
			current.onend = null;
			current.onerror = null;
			current = null;
		}
		host.synth.cancel();
	};

	const voicesReady = (): Promise<SpeechSynthesisVoice[]> => {
		const voices = host.synth.getVoices();
		if (voices.length > 0) return Promise.resolve(voices);
		return new Promise((resolve) => {
			const done = () => {
				clearTimeout(timeout);
				host.synth.removeEventListener("voiceschanged", done);
				resolve(host.synth.getVoices());
			};
			const timeout = setTimeout(done, VOICES_WAIT_MS);
			host.synth.addEventListener("voiceschanged", done);
		});
	};

	const findVoice = (id: string | undefined) => {
		if (!id) return undefined;
		const voices = host.synth.getVoices();
		return voices.find((v) => v.voiceURI === id) ?? voices.find((v) => v.name === id);
	};

	const utterance = (text: string, options: SpeechOptions, lang: string | undefined) => {
		const u = host.createUtterance(text);
		u.rate = clamp(options.rate, 0.1, 10);
		u.pitch = clamp(options.pitch, 0, 2);
		if (lang) u.lang = lang;
		const voice = findVoice(options.voice);
		if (voice) u.voice = voice;
		return u;
	};

	const pause = (reason: PauseReason) => {
		if (!isPlaying) return;
		isPlaying = false;
		halt();
		closeInterval();
		publishState(false, reason);
	};

	const requestMoreIfLow = () => {
		if (isEndOfText || hasRequestedMore || segments.length - cursor >= LOW_WATER_SEGMENTS) return;
		hasRequestedMore = true;
		emit("needMore", {});
	};

	/** Pauses at the cursor when it opens a chapter and the sleep timer waits for one. */
	const stopsForChapterEnd = () => {
		if (!isSleepAtChapterEnd || !segments[cursor]?.opensChapter) return false;
		clearSleepTimer();
		// Progress first, so the position saved on the pause is the new chapter's start.
		reportCursor();
		pause("sleep");
		return true;
	};

	const speakCursor = () => {
		const segment = segments[cursor];
		if (!segment) return;
		const gen = ++generation;
		const offset = Math.min(cursorChar, segment.text.length);
		const u = utterance(segment.text.slice(offset), speech, language);
		const isCurrent = () => gen === generation && isPlaying && segments[cursor]?.id === segment.id;
		const progress = (charStart: number) => {
			cursorChar = charStart;
			updateInterval();
			emit("progress", { segmentId: segment.id, charStart });
		};
		u.onstart = () => {
			if (!isCurrent()) return;
			cursorStartedAt = host.now();
			consecutiveErrors = 0;
			progress(offset);
		};
		u.onboundary = (e) => {
			if (!isCurrent() || (e.name && e.name !== "word")) return;
			progress(offset + e.charIndex);
		};
		u.onend = () => {
			if (isCurrent()) segmentDone(false);
		};
		u.onerror = (e) => {
			if (!isCurrent() || OWN_CANCEL.has(e.error)) return;
			if (FATAL_ERRORS.has(e.error)) pause("error");
			else segmentDone(true);
		};
		current = u;
		host.synth.speak(u);
	};

	const fill = () => {
		if (isWaitingForMore) {
			if (cursor + 1 >= segments.length) return;
			isWaitingForMore = false;
			cursor++;
			cursorChar = 0;
			if (stopsForChapterEnd()) return;
			startInterval();
		}
		speakCursor();
		requestMoreIfLow();
	};

	const segmentDone = (isError: boolean) => {
		if (isError && ++consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
			pause("error");
			return;
		}
		const segment = segments[cursor];
		if (!segment) return;
		if (cursor + 1 >= segments.length) {
			cursorChar = segment.text.length;
			if (!isEndOfText) {
				// Waiting for more text: the finished segment counts as heard, the wait does not.
				closeInterval();
				isWaitingForMore = true;
				current = null;
				requestMoreIfLow();
				return;
			}
			updateInterval();
			pause("end");
			emit("finished", {});
			return;
		}
		cursor++;
		cursorChar = 0;
		if (stopsForChapterEnd()) return;
		fill();
	};

	const play = () => {
		if (isPlaying) return;
		if (cursor >= segments.length) {
			if (isEndOfText) {
				publishState(false, "end");
				emit("finished", {});
			}
			return;
		}
		isPlaying = true;
		consecutiveErrors = 0;
		startInterval();
		publishState(true, "user");
		fill();
	};

	const done = async () => {};

	return {
		start: async (options) => {
			if (isPlaying) {
				isPlaying = false;
				closeInterval();
			}
			halt();
			const load = ++loads;
			segments = [...options.segments];
			cursor = 0;
			cursorChar = 0;
			hasRequestedMore = false;
			isWaitingForMore = false;
			isEndOfText = options.isLast;
			clearSleepTimer();
			language = options.language;
			speech = {
				rate: options.rate,
				pitch: options.pitch,
				voice: options.voice,
				rewindWords: options.rewindWords,
			};
			isStarting = true;
			await voicesReady();
			if (load !== loads) return;
			isStarting = false;
			play();
		},
		append: async ({ segments: more, isLast }) => {
			segments.push(...more);
			hasRequestedMore = false;
			isEndOfText = isLast;
			if (isPlaying && isWaitingForMore) fill();
		},
		pause: async () => {
			if (isStarting) {
				loads++;
				isStarting = false;
				publishState(false, "user");
				return;
			}
			pause("user");
		},
		resume: async () => play(),
		stop: async () => {
			loads++;
			isStarting = false;
			isPlaying = false;
			halt();
			closeInterval();
			clearSleepTimer();
			segments = [];
			cursor = 0;
			cursorChar = 0;
			isWaitingForMore = false;
			publishState(false, "user");
		},
		skip: async ({ direction }) => {
			if (segments.length === 0) return;
			let target = cursor;
			if (direction < 0) {
				const isJustStarted =
					cursorChar === 0 || host.now() - cursorStartedAt < RESTART_SENTENCE_WINDOW_MS;
				if (isJustStarted && cursor > 0) target--;
			} else if (cursor + 1 < segments.length) {
				target++;
			} else {
				return;
			}
			// The skipped text was not listened to: the interval ends where speech was.
			closeInterval();
			cursor = target;
			cursorChar = 0;
			isWaitingForMore = false;
			if (!isPlaying) {
				reportCursor();
				return;
			}
			startInterval();
			halt();
			speakCursor();
			requestMoreIfLow();
		},
		setOptions: async (options) => {
			const isEngineChange =
				options.rate !== speech.rate ||
				options.pitch !== speech.pitch ||
				options.voice !== speech.voice;
			speech = { ...options };
			if (!isEngineChange || !isPlaying || isWaitingForMore) return;
			halt();
			speakCursor();
		},
		setSleepTimer: async ({ durationMs, isAtChapterEnd }) => {
			clearSleepTimer();
			let endsAt = 0;
			if (isAtChapterEnd) {
				isSleepAtChapterEnd = true;
			} else if (durationMs && durationMs > 0) {
				endsAt = host.now() + durationMs;
				sleepEndsAt = endsAt;
				sleepTimeout = setTimeout(() => {
					sleepTimeout = null;
					clearSleepTimer();
					if (isPlaying) pause("sleep");
					else publishState(false, "sleep");
				}, durationMs);
			}
			emit("sleepTimer", { endsAt, isAtChapterEnd: isSleepAtChapterEnd });
		},
		getState: async () => ({
			segmentId: segments[cursor]?.id ?? -1,
			charStart: cursorChar,
		}),
		drainListenLog: async () => {
			const intervals = closedIntervals.splice(0);
			if (openInterval) {
				openInterval.endedAt = host.now();
				intervals.push({ ...openInterval });
			}
			return { intervals };
		},
		getVoices: async () => ({
			voices: (await voicesReady()).map(
				(v): TtsVoice => ({
					name: v.voiceURI,
					language: v.lang.replace("_", "-"),
					quality: v.localService ? LOCAL_QUALITY : NETWORK_QUALITY,
					isNetwork: !v.localService,
					isInstalled: true,
				}),
			),
		}),
		checkLanguage: async ({ language: tag }) => {
			const wanted = primaryLanguage(tag);
			const voices = await voicesReady();
			return {
				status: voices.some((v) => primaryLanguage(v.lang) === wanted)
					? "available"
					: "unsupported",
			};
		},
		speakSample: async ({ text, language: lang, ...options }) => {
			if (isPlaying) return;
			await voicesReady();
			host.synth.cancel();
			const u = utterance(text, options, lang);
			current = u;
			host.synth.speak(u);
		},
		openSystemSettings: done,
		installVoiceData: done,
		addListener: async (event, cb) => {
			const set = listeners.get(event) ?? new Set();
			set.add(cb as Listener);
			listeners.set(event, set);
			const handle: PluginListenerHandle = { remove: async () => void set.delete(cb as Listener) };
			return handle;
		},
	};
}
