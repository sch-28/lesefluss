import { useEffect } from "react";
import {
	type ActiveBook,
	type AppShell,
	type BookSummary,
	readerBus,
	type ReaderActions,
	type ReaderContext,
	type ReaderState,
	type SettingsSnapshot,
} from "./reader-bus";

interface EngineProps extends ReaderState, ReaderActions {}

/**
 * Mirrors live RSVP-engine state into readerBus and registers the engine's
 * action handlers so external consumers can drive the reader. Renders nothing.
 *
 * Sole insertion point: pages/reader/rsvp-view.tsx — siblings of the display.
 */
export function ReaderEngineBroadcast(props: EngineProps) {
	const {
		word,
		wordIndex,
		isPlaying,
		wpm,
		togglePlayPause,
		pause,
		changeWpm,
		backWord,
		forwardWord,
		backSentence,
		forwardSentence,
		jumpToWord,
	} = props;

	useEffect(() => {
		readerBus.publishState({ word, wordIndex, isPlaying, wpm });
	}, [word, wordIndex, isPlaying, wpm]);

	useEffect(
		() => readerBus.registerActions({
			togglePlayPause,
			pause,
			changeWpm,
			backWord,
			forwardWord,
			backSentence,
			forwardSentence,
			jumpToWord,
		}),
		[
			togglePlayPause,
			pause,
			changeWpm,
			backWord,
			forwardWord,
			backSentence,
			forwardSentence,
			jumpToWord,
		],
	);

	useEffect(
		() => () => {
			readerBus.publishState(null);
		},
		[],
	);

	return null;
}

/**
 * Mirrors book/chapter context into readerBus. Sole insertion point:
 * pages/reader/index.tsx, near the RsvpView render.
 */
export function ReaderContextBroadcast(props: ReaderContext) {
	const {
		bookTitle,
		bookAuthor,
		chapterTitle,
		chapterIndex,
		totalChapters,
		progressBytes,
		totalBytes,
		focalColor,
	} = props;

	useEffect(() => {
		readerBus.publishContext({
			bookTitle,
			bookAuthor,
			chapterTitle,
			chapterIndex,
			totalChapters,
			progressBytes,
			totalBytes,
			focalColor,
		});
	}, [
		bookTitle,
		bookAuthor,
		chapterTitle,
		chapterIndex,
		totalChapters,
		progressBytes,
		totalBytes,
		focalColor,
	]);

	useEffect(
		() => () => {
			readerBus.publishContext(null);
		},
		[],
	);

	return null;
}

/**
 * App-wide state publisher (theme + active route). Lives at the App shell so
 * it keeps publishing even when the reader is unmounted — that's what fixed
 * the "theme change doesn't reach screen 2 outside the reader" bug.
 */
export function AppShellBroadcast(props: AppShell) {
	const { theme, activeRoute } = props;
	useEffect(() => {
		readerBus.publishAppShell({ theme, activeRoute });
	}, [theme, activeRoute]);
	useEffect(
		() => () => {
			readerBus.publishAppShell(null);
		},
		[],
	);
	return null;
}

export function LibraryBroadcast(props: { books: BookSummary[] | null }) {
	const { books } = props;
	useEffect(() => {
		readerBus.publishLibrary(books);
	}, [books]);
	useEffect(
		() => () => {
			readerBus.publishLibrary(null);
		},
		[],
	);
	return null;
}

export function ActiveBookBroadcast(props: { book: ActiveBook | null }) {
	const { book } = props;
	useEffect(() => {
		readerBus.publishActiveBook(book);
	}, [book]);
	useEffect(
		() => () => {
			readerBus.publishActiveBook(null);
		},
		[],
	);
	return null;
}

export function SettingsBroadcast(props: { settings: SettingsSnapshot | null }) {
	const { settings } = props;
	useEffect(() => {
		readerBus.publishSettings(settings);
	}, [settings]);
	useEffect(
		() => () => {
			readerBus.publishSettings(null);
		},
		[],
	);
	return null;
}
