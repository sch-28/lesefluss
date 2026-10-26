import type { PluginListenerHandle } from "@capacitor/core";
import type { TtsPlugin } from "../services/tts";

/**
 * Dev-only stand-in for the native Tts plugin, so read-aloud runs in a browser
 * under Playwright. Nothing speaks on its own: the test drives it through
 * `window.__lesefluss_e2e_tts`. Enabled by setting `window.__lesefluss_e2e_fakeTts`
 * before the app loads; the callsite is behind `import.meta.env.DEV`.
 */

type Segment = { id: number; text: string };
type Listener = (data: unknown) => void;

export type E2ETtsDriver = {
	/** Speaks the next `words` words: one progress event each, then asks for more text when out. */
	speak: (words: number) => void;
	isPlaying: () => boolean;
	/** Sessions the app has started; a new one's text arrives asynchronously after the UI shows it. */
	starts: () => number;
	/** A pause or resume from outside the app: earbuds, the notification, audio focus. */
	setPlayingBySystem: (playing: boolean) => void;
};

export function isFakeTtsRequested(): boolean {
	return (
		(window as unknown as { __lesefluss_e2e_fakeTts?: boolean }).__lesefluss_e2e_fakeTts === true
	);
}

export function createFakeTts(): TtsPlugin {
	const listeners = new Map<string, Set<Listener>>();
	let segments: Segment[] = [];
	let cursor = { segment: 0, word: 0 };
	let isPlaying = false;
	let starts = 0;

	const emit = (event: string, data: unknown) => {
		for (const listener of listeners.get(event) ?? []) listener(data);
	};
	const setPlaying = (playing: boolean) => {
		isPlaying = playing;
		emit("state", { isPlaying: playing, reason: "user" });
	};
	const wordStarts = (text: string) => [...text.matchAll(/\S+/g)].map((m) => m.index ?? 0);

	const driver: E2ETtsDriver = {
		speak: (words) => {
			for (let i = 0; i < words && isPlaying; i++) {
				const segment = segments[cursor.segment];
				if (!segment) {
					emit("needMore", {});
					return;
				}
				const starts = wordStarts(segment.text);
				emit("progress", { segmentId: segment.id, charStart: starts[cursor.word] ?? 0 });
				cursor =
					cursor.word + 1 < starts.length
						? { segment: cursor.segment, word: cursor.word + 1 }
						: { segment: cursor.segment + 1, word: 0 };
			}
		},
		isPlaying: () => isPlaying,
		starts: () => starts,
		setPlayingBySystem: (playing) => setPlaying(playing),
	};
	(window as unknown as { __lesefluss_e2e_tts?: E2ETtsDriver }).__lesefluss_e2e_tts = driver;

	const done = async () => {};
	return {
		start: async ({ segments: first }) => {
			segments = [...first];
			cursor = { segment: 0, word: 0 };
			starts++;
			setPlaying(true);
		},
		append: async ({ segments: more }) => {
			segments.push(...more);
		},
		pause: async () => setPlaying(false),
		resume: async () => setPlaying(true),
		stop: async () => {
			isPlaying = false;
		},
		skip: done,
		setOptions: done,
		setSleepTimer: done,
		getState: async () => ({
			segmentId: segments[cursor.segment]?.id ?? -1,
			charStart: 0,
		}),
		drainListenLog: async () => ({ intervals: [] }),
		getVoices: async () => ({ voices: [] }),
		checkLanguage: async () => ({ status: "available" }),
		speakSample: done,
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
