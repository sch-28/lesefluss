/**
 * readerBus — generic mirror of in-app reader state.
 *
 * The RSVP engine owns the source of truth (state inside `useRsvpEngine`).
 * The bus is a downstream window so non-React consumers (dual-screen bridge,
 * future analytics, debug overlays) can observe live state and dispatch
 * back into the reader without the reader importing them.
 *
 * Two payload halves:
 *   - state   — high-frequency engine output (current word, isPlaying, …)
 *   - context — low-frequency book/chapter info, published from reader/index.tsx
 *
 * Splitting them lets each publisher write only what it owns; no prop
 * drilling, no lifting state out of the reader.
 */

export interface ReaderState {
	word: string | null;
	wordIndex: number;
	isPlaying: boolean;
	wpm: number;
}

export type ReaderTheme = "dark" | "sepia" | "light";

export interface ReaderContext {
	bookTitle: string | null;
	bookAuthor: string | null;
	chapterTitle: string | null;
	chapterIndex: number;
	totalChapters: number;
	progressBytes: number;
	totalBytes: number;
	focalColor: string;
}

/** App-wide state published from the App shell, not the reader. */
export interface AppShell {
	theme: ReaderTheme;
	/** Current router pathname; secondary uses this to pick a view. */
	activeRoute: string;
}

export interface BookSummary {
	id: string;
	title: string;
	author: string | null;
	progress: number; // 0..1
}

export interface ActiveBook {
	id: string;
	title: string;
	author: string | null;
	coverImage: string | null; // base64 data url
	progress: number;
}

export interface SettingsSnapshot {
	wpm: number;
	delayComma: number;
	delayPeriod: number;
	accelStart: number;
	accelRate: number;
	focalLetterColor: string;
}

export interface ReaderActions {
	togglePlayPause: () => void;
	pause: () => void;
	changeWpm: (wpm: number) => void;
	backWord: () => void;
	forwardWord: () => void;
	backSentence: () => void;
	forwardSentence: () => void;
	jumpToWord: (idx: number) => void;
}

/**
 * App-shell-level actions registered from outside the reader (router push,
 * settings mutations). Distinct from {@link ReaderActions} which only exist
 * while the RSVP engine is mounted.
 */
export interface AppShellActions {
	openBook: (bookId: string) => void;
	updateSetting: (key: string, value: unknown) => void;
}

export type ReaderSnapshot = {
	state: ReaderState | null;
	context: ReaderContext | null;
	appShell: AppShell | null;
	library: BookSummary[] | null;
	activeBook: ActiveBook | null;
	settings: SettingsSnapshot | null;
};

type Listener = (snapshot: ReaderSnapshot) => void;

let state: ReaderState | null = null;
let context: ReaderContext | null = null;
let appShell: AppShell | null = null;
let library: BookSummary[] | null = null;
let activeBook: ActiveBook | null = null;
let settings: SettingsSnapshot | null = null;
let actions: ReaderActions | null = null;
let appShellActions: AppShellActions | null = null;
const listeners = new Set<Listener>();

function snapshot(): ReaderSnapshot {
	return { state, context, appShell, library, activeBook, settings };
}

function emit() {
	const snap = snapshot();
	for (const fn of listeners) fn(snap);
}

export const readerBus = {
	publishState(next: ReaderState | null) {
		state = next;
		emit();
	},
	publishContext(next: ReaderContext | null) {
		context = next;
		emit();
	},
	publishAppShell(next: AppShell | null) {
		appShell = next;
		emit();
	},
	publishLibrary(next: BookSummary[] | null) {
		library = next;
		emit();
	},
	publishActiveBook(next: ActiveBook | null) {
		activeBook = next;
		emit();
	},
	publishSettings(next: SettingsSnapshot | null) {
		settings = next;
		emit();
	},
	subscribe(fn: Listener): () => void {
		listeners.add(fn);
		fn(snapshot());
		return () => {
			listeners.delete(fn);
		};
	},
	registerActions(a: ReaderActions): () => void {
		actions = a;
		return () => {
			if (actions === a) actions = null;
		};
	},
	registerAppShellActions(a: AppShellActions): () => void {
		appShellActions = a;
		return () => {
			if (appShellActions === a) appShellActions = null;
		};
	},
	// Dispatchers — no-op when no reader is mounted.
	togglePlayPause() {
		actions?.togglePlayPause();
	},
	pause() {
		actions?.pause();
	},
	changeWpm(wpm: number) {
		actions?.changeWpm(wpm);
	},
	backWord() {
		actions?.backWord();
	},
	forwardWord() {
		actions?.forwardWord();
	},
	backSentence() {
		actions?.backSentence();
	},
	forwardSentence() {
		actions?.forwardSentence();
	},
	jumpToWord(idx: number) {
		actions?.jumpToWord(idx);
	},
	openBook(bookId: string) {
		appShellActions?.openBook(bookId);
	},
	updateSetting(key: string, value: unknown) {
		appShellActions?.updateSetting(key, value);
	},
};
