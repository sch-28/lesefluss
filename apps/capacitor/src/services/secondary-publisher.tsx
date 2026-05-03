import { DEFAULT_SETTINGS } from "@lesefluss/core";
import { useEffect, useMemo } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { useTheme } from "../contexts/theme-context";
import { useAutoSaveSettings } from "../hooks/use-auto-save-settings";
import { queryHooks } from "./db/hooks";
import { readerBus } from "./reader-bus";
import {
	ActiveBookBroadcast,
	AppShellBroadcast,
	LibraryBroadcast,
	SettingsBroadcast,
} from "./reader-broadcast";
import type { ActiveBook, BookSummary, SettingsSnapshot } from "./reader-bus";

/**
 * Single component that bridges all the primary-side state the secondary
 * screen wants (theme, route, library, active book, settings) into the bus.
 * Lives at App level (inside QueryClientProvider + DatabaseProvider +
 * ThemeProvider + Router). Renders nothing.
 *
 * Kept entirely outside `pages/` so the reader has zero awareness of it.
 */
export function SecondaryPublisher() {
	const { theme } = useTheme();
	const location = useLocation();
	const history = useHistory();
	const { data: booksData } = queryHooks.useBooks();
	const books = booksData?.books;
	const covers = booksData?.covers;
	const { data: settings } = queryHooks.useSettings();
	const { updateSetting } = useAutoSaveSettings();

	// Register app-shell-level command handlers (open book, update setting).
	// Reader-level actions (togglePlayPause, etc.) are registered separately
	// by ReaderEngineBroadcast — they only exist while the engine is mounted.
	useEffect(
		() =>
			readerBus.registerAppShellActions({
				openBook(bookId: string) {
					history.push(`/reader/${bookId}`);
				},
				updateSetting(key: string, value: unknown) {
					// Cast through unknown to keep useAutoSaveSettings's strict
					// per-key typing — bus is intentionally generic.
					updateSetting(key as never, value as never);
				},
			}),
		[history, updateSetting],
	);

	// Prefer the book currently open in the reader (URL param), else the most
	// recently read book in the library. The `isActive` flag is reserved for
	// the ESP32 hardware target and not used here.
	const activeBookId = useMemo(() => {
		const m = location.pathname.match(/^\/reader\/([^/]+)/);
		return m?.[1] ?? null;
	}, [location.pathname]);

	const library: BookSummary[] | null = useMemo(() => {
		if (!books) return null;
		return books
			.slice()
			.sort((a, b) => (b.lastRead ?? 0) - (a.lastRead ?? 0))
			.slice(0, 24)
			.map((b) => ({
				id: b.id,
				title: b.title,
				author: b.author ?? null,
				progress: b.size > 0 ? b.position / b.size : 0,
			}));
	}, [books]);

	const activeBook: ActiveBook | null = useMemo(() => {
		if (!books || books.length === 0) return null;
		const target =
			(activeBookId && books.find((b) => b.id === activeBookId)) ||
			books.slice().sort((a, b) => (b.lastRead ?? 0) - (a.lastRead ?? 0))[0];
		if (!target) return null;
		return {
			id: target.id,
			title: target.title,
			author: target.author ?? null,
			coverImage: covers?.get(target.id) ?? null,
			progress: target.size > 0 ? target.position / target.size : 0,
		};
	}, [books, activeBookId, covers]);

	const settingsSnap: SettingsSnapshot | null = useMemo(() => {
		if (!settings) return null;
		return {
			wpm: settings.wpm,
			delayComma: settings.delayComma,
			delayPeriod: settings.delayPeriod,
			accelStart: settings.accelStart,
			accelRate: settings.accelRate,
			focalLetterColor: settings.focalLetterColor ?? DEFAULT_SETTINGS.FOCAL_LETTER_COLOR,
		};
	}, [settings]);

	return (
		<>
			<AppShellBroadcast theme={theme} activeRoute={location.pathname} />
			<LibraryBroadcast books={library} />
			<ActiveBookBroadcast book={activeBook} />
			<SettingsBroadcast settings={settingsSnap} />
		</>
	);
}
