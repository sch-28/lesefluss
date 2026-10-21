import { App as CapacitorApp } from "@capacitor/app";
import type { WordIndex } from "@lesefluss/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "../../components/toast";
import type { Chapter } from "../../services/db/schema";
import { persistRow } from "../../services/reading-sessions/persist";
import type { PersistKind } from "../../services/reading-sessions/rules";
import {
	drainListenLog,
	type PauseReason,
	ReadAloud,
	type ReadAloudSpeech,
	type SleepTimer,
	ttsEngine,
} from "../../services/tts";
import { ListenRecorder } from "../../services/tts/listen-sessions";
import {
	loadBaseline,
	nextBaseline,
	PaceMeter,
	rateFor,
	saveBaseline,
} from "../../services/tts/pace";
import { log } from "../../utils/log";

export type ReadAloudStatus = "off" | "playing" | "paused";

type SleepTimerChoice = { minutes: number } | "chapterEnd" | null;

/** Same pace as RSVP's position saves: often enough to survive a kill, rarely enough to stay cheap. */
const POSITION_SAVE_THROTTLE_MS = 2000;
const LISTEN_CHECKPOINT_MS = 30_000;
const PACE_CHECK_MS = 20_000;
// Retuning restarts the sentence in the engine, so only a clear drift is worth it.
const RATE_RETUNE_SHARE = 0.06;
// Scrubbing the progress bar jumps on every move; the voice follows once it settles.
const MOVE_DEBOUNCE_MS = 250;
const NO_SLEEP_TIMER: SleepTimer = { endsAt: null, isAtChapterEnd: false };

type Options = {
	bookId: string;
	content: string | null | undefined;
	wordIndex: WordIndex | null | undefined;
	chapters: readonly Chapter[];
	title: string;
	author: string | null;
	cover: string | null;
	language: string | null;
	speech: ReadAloudSpeech;
	/** The reader's current word, where reading aloud starts. */
	getStartWord: () => number;
	/** The first word on screen, for "listen from here" after scrolling away. */
	getViewWord: () => number | null;
	/** Every word as it is spoken. */
	onWord: (word: number) => void;
	/** The spoken word to persist: throttled while speaking, then on every pause and stop. */
	onSavePosition: (word: number) => void;
	onFurthestRead?: (sessionId: string, word: number | null) => void;
};

export function useReadAloud(options: Options) {
	const [status, setStatus] = useState<ReadAloudStatus>("off");
	const [isFollowing, setIsFollowing] = useState(true);
	const [sleepTimer, setSleepTimerState] = useState<SleepTimer>(NO_SLEEP_TIMER);
	const [measuredWpm, setMeasuredWpm] = useState<number | null>(null);
	const sessionRef = useRef<ReadAloud | null>(null);
	const recorderRef = useRef<ListenRecorder | null>(null);
	const spokenWordRef = useRef<number | null>(null);
	const lastSaveAtRef = useRef(0);
	// Where the reader looked while following was off; "read from here" starts there.
	const viewWordRef = useRef<number | null>(null);
	const sleepTimerRef = useRef(sleepTimer);
	sleepTimerRef.current = sleepTimer;
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const meterRef = useRef(new PaceMeter());
	// The learned pace belongs to one voice; a voice change must not learn into the wrong one.
	const baselineRef = useRef({
		voice: options.speech.voice,
		wpm: loadBaseline(options.speech.voice),
	});
	const rateRef = useRef(rateFor(options.speech.wpm, baselineRef.current.wpm));
	// Starts run one after another: a session must be stopped before the next takes the engine.
	const startChainRef = useRef<Promise<void>>(Promise.resolve());
	const moveTimerRef = useRef<number | null>(null);

	const engineSpeech = useCallback(() => {
		const { wpm, pitch, voice, rewindWords } = optionsRef.current.speech;
		if (baselineRef.current.voice !== voice) {
			baselineRef.current = { voice, wpm: loadBaseline(voice) };
		}
		rateRef.current = rateFor(wpm, baselineRef.current.wpm);
		return { rate: rateRef.current, pitch, voice, rewindWords };
	}, []);

	const cancelPendingMove = useCallback(() => {
		if (moveTimerRef.current === null) return;
		clearTimeout(moveTimerRef.current);
		moveTimerRef.current = null;
	}, []);

	const saveSpokenWord = useCallback(() => {
		const word = spokenWordRef.current;
		if (word === null) return;
		lastSaveAtRef.current = Date.now();
		optionsRef.current.onSavePosition(word);
	}, []);

	const recordListening = useCallback(async (kind: PersistKind) => {
		const recorder = recorderRef.current;
		if (!recorder) return;
		try {
			const rows = recorder.ingest(await drainListenLog(), Date.now());
			for (const row of rows) {
				persistRow(row, kind);
				optionsRef.current.onFurthestRead?.(row.id, row.furthestWord);
			}
		} catch (err) {
			log.error("tts", "listen log failed:", err);
		}
	}, []);

	const endSession = useCallback(
		async (session: ReadAloud) => {
			// A session being replaced by "read from here" leaves state to its successor.
			if (sessionRef.current === session) {
				sessionRef.current = null;
				cancelPendingMove();
				setStatus("off");
				setSleepTimerState(NO_SLEEP_TIMER);
				setMeasuredWpm(null);
				saveSpokenWord();
			}
			try {
				await session.stop();
			} catch (err) {
				log.warn("tts", "stop failed:", err);
			} finally {
				await recordListening("flush");
				session.release();
			}
		},
		[cancelPendingMove, saveSpokenWord, recordListening],
	);

	const start = useCallback(
		(startWord: number) => {
			const { content, wordIndex, bookId, language } = optionsRef.current;
			if (!content || !wordIndex) return;
			if (recorderRef.current === null) recorderRef.current = new ListenRecorder(bookId);
			const previous = sessionRef.current;
			// Stopping the old voice replaces the engine's queue and clears its sleep timer.
			const carriedTimer = previous ? sleepTimerRef.current : NO_SLEEP_TIMER;
			const session = new ReadAloud({
				content,
				wordIndex,
				startWord,
				chapters: optionsRef.current.chapters,
				title: optionsRef.current.title,
				author: optionsRef.current.author,
				cover: optionsRef.current.cover,
				language,
				speech: engineSpeech(),
				onWord: (word) => {
					// A replaced voice, or one about to be moved, must not pull the view back.
					if (sessionRef.current !== session || moveTimerRef.current !== null) return;
					spokenWordRef.current = word;
					meterRef.current.record(word, Date.now());
					optionsRef.current.onWord(word);
					if (Date.now() - lastSaveAtRef.current >= POSITION_SAVE_THROTTLE_MS) saveSpokenWord();
				},
				onPlayingChange: (isPlaying: boolean, reason: PauseReason) => {
					if (sessionRef.current !== session) return;
					meterRef.current.reset();
					// Stopped from the notification or a media button, or the engine gave up.
					if (reason === "stopped" || reason === "error") {
						if (reason === "error") toast.error("The speech engine stopped reading");
						void endSession(session);
						return;
					}
					setStatus(isPlaying ? "playing" : "paused");
					if (isPlaying) return;
					saveSpokenWord();
					void recordListening("flush");
					if (reason === "sleep") toast.info("Sleep timer: listening paused");
				},
				onFinished: () => {
					if (sessionRef.current === session) void endSession(session);
				},
				onSleepTimerChange: (timer) => {
					if (sessionRef.current === session) setSleepTimerState(timer);
				},
			});
			sessionRef.current = session;
			spokenWordRef.current = startWord;
			viewWordRef.current = null;
			meterRef.current.reset();
			setMeasuredWpm(null);
			setIsFollowing(true);
			setStatus("playing");
			const begin = startChainRef.current.then(async () => {
				if (previous) await endSession(previous);
				await session.start();
				const remainingMs = carriedTimer.endsAt === null ? 0 : carriedTimer.endsAt - Date.now();
				if (carriedTimer.isAtChapterEnd) await session.setSleepTimer({ isAtChapterEnd: true });
				else if (remainingMs > 0) await session.setSleepTimer({ durationMs: remainingMs });
			});
			startChainRef.current = begin.catch((err: unknown) => {
				log.error("tts", "start failed:", err);
				toast.error("Listening could not start");
				void endSession(session);
			});
			if (!previous && language) void warnIfVoiceMissing(language);
		},
		[saveSpokenWord, recordListening, endSession, engineSpeech],
	);

	const stop = useCallback(() => {
		const session = sessionRef.current;
		if (session) void endSession(session);
	}, [endSession]);

	const readFromView = useCallback(() => {
		const word = viewWordRef.current ?? optionsRef.current.getViewWord();
		if (word !== null) start(word);
	}, [start]);

	const toggle = useCallback(() => {
		const session = sessionRef.current;
		if (!session) {
			start(optionsRef.current.getStartWord());
			return;
		}
		if (status === "playing") void session.pause();
		// Looked elsewhere while paused: play reads from there.
		else if (!isFollowing) readFromView();
		else void session.resume();
	}, [start, status, isFollowing, readFromView]);

	/** A tapped word or a jump (contents, search, scrub): the voice goes there and plays. */
	const moveTo = useCallback(
		(word: number) => {
			if (!sessionRef.current) return;
			cancelPendingMove();
			moveTimerRef.current = window.setTimeout(() => {
				moveTimerRef.current = null;
				if (sessionRef.current) start(word);
			}, MOVE_DEBOUNCE_MS);
		},
		[start, cancelPendingMove],
	);

	const pause = useCallback(() => {
		void sessionRef.current?.pause();
	}, []);

	const skip = useCallback((direction: 1 | -1) => {
		void sessionRef.current?.skip(direction);
	}, []);

	/** The reader looked elsewhere (scrolled, turned a page): stop following, keep speaking. */
	const detach = useCallback((viewWord: number | null = null) => {
		viewWordRef.current = viewWord;
		setIsFollowing(false);
	}, []);

	const resumeFollowing = useCallback(() => {
		viewWordRef.current = null;
		setIsFollowing(true);
	}, []);

	const setSleepTimer = useCallback((choice: SleepTimerChoice) => {
		const session = sessionRef.current;
		if (!session) return;
		void session.setSleepTimer(
			choice === null
				? null
				: choice === "chapterEnd"
					? { isAtChapterEnd: true }
					: { durationMs: choice.minutes * 60_000 },
		);
	}, []);

	const { wpm, pitch, voice, rewindWords } = options.speech;
	// biome-ignore lint/correctness/useExhaustiveDependencies: the speech values are triggers; engineSpeech reads them through a ref.
	useEffect(() => {
		meterRef.current.reset();
		setMeasuredWpm(null);
		void sessionRef.current?.setSpeech(engineSpeech());
	}, [wpm, pitch, voice, rewindWords, engineSpeech]);

	// Learn this voice's pace from what it speaks and retune when the target drifts.
	useEffect(() => {
		if (status !== "playing") return;
		const check = setInterval(() => {
			const measured = meterRef.current.wpm();
			setMeasuredWpm(measured);
			const { voice: currentVoice, wpm: target } = optionsRef.current.speech;
			if (measured === null || baselineRef.current.voice !== currentVoice) return;
			const learned = nextBaseline(baselineRef.current.wpm, measured, rateRef.current);
			baselineRef.current = { voice: currentVoice, wpm: learned };
			saveBaseline(currentVoice, learned);
			const retuned = rateFor(target, learned);
			if (Math.abs(retuned - rateRef.current) / rateRef.current <= RATE_RETUNE_SHARE) return;
			meterRef.current.reset();
			setMeasuredWpm(null);
			void sessionRef.current?.setSpeech(engineSpeech());
		}, PACE_CHECK_MS);
		return () => clearInterval(check);
	}, [status, engineSpeech]);

	// Playback goes on with the screen off; JS may not have run since, so catch up on return.
	useEffect(() => {
		if (status === "off") return;
		const checkpoint = setInterval(() => void recordListening("checkpoint"), LISTEN_CHECKPOINT_MS);
		const listener = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
			const session = sessionRef.current;
			if (!isActive || !session) return;
			void session.currentWord().then((word) => {
				if (word === null || sessionRef.current !== session) return;
				spokenWordRef.current = word;
				optionsRef.current.onWord(word);
				saveSpokenWord();
			});
			void recordListening("checkpoint");
		});
		return () => {
			clearInterval(checkpoint);
			void listener.then((handle) => handle.remove());
		};
	}, [status, recordListening, saveSpokenWord]);

	useEffect(
		() => () => {
			cancelPendingMove();
			const session = sessionRef.current;
			if (session) void endSession(session);
		},
		[endSession, cancelPendingMove],
	);

	return {
		status,
		measuredWpm,
		isFollowing,
		sleepTimer,
		toggle,
		pause,
		moveTo,
		stop,
		skip,
		detach,
		resumeFollowing,
		readFromView,
		setSleepTimer,
		spokenWordRef,
	};
}

async function warnIfVoiceMissing(language: string): Promise<void> {
	try {
		const { status } = await ttsEngine.checkLanguage(language);
		if (status === "missingData") {
			toast.warning("The voice for this book's language is not downloaded yet", {
				action: {
					label: "Download",
					onClick: () => void ttsEngine.installVoiceData(),
				},
			});
		} else if (status === "unsupported") {
			toast.info("Your speech engine has no voice for this book's language");
		}
	} catch (err) {
		log.warn("tts", "language check failed:", err);
	}
}
