import { Preferences } from "@capacitor/preferences";
import {
	pick,
	SYNCED_SETTING_KEYS,
	type SyncBook,
	type SyncGlossaryEntry,
	type SyncHighlight,
	type SyncPayload,
	type SyncResponse,
	type SyncSeries,
	type SyncSettings,
} from "@lesefluss/rsvp-core";
import { log } from "../../utils/log";
import { bookKeys, glossaryKeys, serialKeys, settingsKeys } from "../db/hooks/query-keys";
import { queries } from "../db/queries";
import type { Book, BookContent, GlossaryEntry, Highlight, Series, Settings } from "../db/schema";
import { queryClient } from "../query-client";
import { SYNC_URL } from "./auth-client";

/** True when the capacitor app is hosted inside the website (same origin, cookie auth). */
export const IS_WEB_BUILD = import.meta.env.VITE_WEB_BUILD === "true";

/** Sync is available when explicitly configured OR running as web embed. */
export const SYNC_ENABLED = !!SYNC_URL || IS_WEB_BUILD;

/** True when sync runs on native (bearer token) rather than as a web embed (cookie). */
export const NATIVE_SYNC_ENABLED = SYNC_ENABLED && !IS_WEB_BUILD;

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

const TOKEN_KEY = "sync_token";
const LAST_SYNCED_KEY = "sync_last_synced";
const USER_EMAIL_KEY = "sync_user_email";
const AUTH_STATE_KEY = "sync_auth_state";

export async function getToken(): Promise<string | null> {
	const { value } = await Preferences.get({ key: TOKEN_KEY });
	return value;
}

async function saveToken(token: string): Promise<void> {
	await Preferences.set({ key: TOKEN_KEY, value: token });
}

async function clearToken(): Promise<void> {
	await Preferences.remove({ key: TOKEN_KEY });
	await Preferences.remove({ key: USER_EMAIL_KEY });
	await Preferences.remove({ key: AUTH_STATE_KEY });
}

export async function getLastSynced(): Promise<number | null> {
	const { value } = await Preferences.get({ key: LAST_SYNCED_KEY });
	return value ? Number(value) : null;
}

export async function getUserEmail(): Promise<string | null> {
	const { value } = await Preferences.get({ key: USER_EMAIL_KEY });
	return value;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Start a mobile login handoff: generate a random state, persist it, and return
 * it to be embedded in the web callback URL. Paired with {@link consumeAuthState}
 * to defend the deep-link callback against session fixation from other apps.
 */
export async function beginMobileLogin(): Promise<string> {
	const state = crypto.randomUUID();
	await Preferences.set({ key: AUTH_STATE_KEY, value: state });
	return state;
}

let consumeInFlight = false;

/**
 * Read and clear the pending login state. Call from the deep-link handler and
 * compare against the state echoed back in the callback URL. Concurrent callers
 * get `null` — only the first wins, which prevents two racing `appUrlOpen`
 * events from both passing the state check off the same pending nonce.
 */
export async function consumeAuthState(): Promise<string | null> {
	if (consumeInFlight) return null;
	consumeInFlight = true;
	try {
		const { value } = await Preferences.get({ key: AUTH_STATE_KEY });
		await Preferences.remove({ key: AUTH_STATE_KEY });
		return value;
	} finally {
		consumeInFlight = false;
	}
}

export function hasEmail(v: unknown): v is { email: string } {
	return (
		typeof v === "object" && v !== null && typeof (v as { email?: unknown }).email === "string"
	);
}

/**
 * Store a session token obtained from the deep-link callback and fetch the user
 * email to populate local state. Only call this after verifying the nonce state
 * — the caller is trusted to have confirmed the token is ours, not an attacker's.
 */
export async function finalizeVerifiedLogin(token: string): Promise<{ email: string }> {
	await saveToken(token);
	const res = await fetch(`${SYNC_URL}/api/auth/get-session`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!res.ok) {
		await clearToken();
		throw new Error(`Failed to verify session (${res.status})`);
	}
	const data: unknown = await res.json();
	const user =
		typeof data === "object" && data !== null ? (data as { user?: unknown }).user : undefined;
	if (!hasEmail(user)) {
		await clearToken();
		throw new Error("Invalid session response");
	}
	await Preferences.set({ key: USER_EMAIL_KEY, value: user.email });
	return { email: user.email };
}

export async function signOut(): Promise<void> {
	const token = await getToken();
	await clearToken();
	// Server-side invalidation is best-effort: if we're offline or the request
	// fails, the token is gone from this device but stays valid on the server
	// until its TTL expires. Accepted trade-off for immediate UI response.
	if (token && SYNC_URL) {
		void fetch(`${SYNC_URL}/api/auth/sign-out`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		}).catch(() => {});
	}
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function syncFetch(path: string, options?: RequestInit): Promise<Response> {
	// Internal callers always pass plain object headers
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(options?.headers as Record<string, string>),
	};

	if (!IS_WEB_BUILD) {
		// Native app: use Bearer token from Preferences
		const token = await getToken();
		if (!token) throw new Error("Not authenticated");
		headers.Authorization = `Bearer ${token}`;
	}

	const url = `${SYNC_URL}${path}`;
	const method = options?.method ?? "GET";
	let res: Response;
	try {
		res = await fetch(url, {
			...options,
			credentials: IS_WEB_BUILD ? "include" : undefined,
			headers,
		});
	} catch (err) {
		// Diagnostics for "TypeError: Failed to fetch" — capture context the
		// generic browser error strips out. (TASK-102)
		const headerBytes = Object.entries(headers).reduce(
			(n, [k, v]) => n + k.length + v.length + 4,
			0,
		);
		const haveHeader = headers["X-Sync-Have"] ?? "";
		const haveCount = haveHeader ? haveHeader.split(",").filter(Boolean).length : 0;
		const bodyDesc =
			typeof options?.body === "string"
				? `${options.body.length}b`
				: options?.body
					? "non-string"
					: "none";
		log.error(
			"sync",
			`fetch threw url=${url} method=${method} online=${typeof navigator !== "undefined" ? navigator.onLine : "n/a"} headerBytes=${headerBytes} haveHeaderBytes=${haveHeader.length} haveCount=${haveCount} body=${bodyDesc} errorName=${err instanceof Error ? err.name : typeof err} errorMessage=${err instanceof Error ? err.message : String(err)}`,
		);
		if (err instanceof Error && err.stack) log.error("sync", "fetch threw stack:", err.stack);
		throw err;
	}

	if (res.status === 401) {
		if (!IS_WEB_BUILD) await clearToken();
		throw new Error("Session expired");
	}

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Sync failed (${res.status}): ${text}`);
	}

	return res;
}

// ---------------------------------------------------------------------------
// Data mappers (Capacitor SQLite → API payload)
// ---------------------------------------------------------------------------

export function bookToSync(book: Book, contentData?: BookContent | null): SyncBook {
	return {
		bookId: book.id,
		title: book.title,
		author: book.author,
		fileSize: book.size,
		wordCount: null,
		position: book.position,
		source: book.source,
		catalogId: book.catalogId,
		sourceUrl: book.sourceUrl,
		seriesId: book.seriesId,
		chapterIndex: book.chapterIndex,
		chapterSourceUrl: book.chapterSourceUrl,
		chapterStatus: book.chapterStatus,
		deleted: book.deleted,
		// Chapter rows (seriesId set) are re-derivable from the upstream provider, so we
		// never push their body content / cover / TOC — saves substantial bytes per series.
		...(contentData && !book.deleted && !book.seriesId
			? {
					content: contentData.content,
					coverImage: contentData.coverImage,
					chapters: contentData.chapters,
				}
			: {}),
		updatedAt: Math.max(book.lastRead ?? 0, book.addedAt),
	};
}

function seriesToSync(s: Series): SyncSeries {
	return {
		seriesId: s.id,
		title: s.title,
		author: s.author,
		coverImage: s.coverImage,
		description: s.description,
		sourceUrl: s.sourceUrl,
		tocUrl: s.tocUrl,
		provider: s.provider as SyncSeries["provider"],
		lastCheckedAt: s.lastCheckedAt,
		createdAt: s.createdAt,
		deleted: s.deleted,
		updatedAt: s.updatedAt,
	};
}

function settingsToSync(s: Settings): SyncSettings {
	// Cast: SQLite columns widen enum fields to `string`; SyncSettings narrows
	// them to literal unions. Values originate from validated UI/Zod input.
	return { ...pick(s, SYNCED_SETTING_KEYS), updatedAt: s.updatedAt } as SyncSettings;
}

function highlightToSync(h: Highlight): SyncHighlight {
	return {
		highlightId: h.id,
		bookId: h.bookId,
		startOffset: h.startOffset,
		endOffset: h.endOffset,
		color: h.color as SyncHighlight["color"],
		note: h.note,
		text: h.text,
		deleted: false,
		createdAt: h.createdAt,
		updatedAt: h.updatedAt,
	};
}

function entryToSync(e: GlossaryEntry): SyncGlossaryEntry {
	return {
		entryId: e.id,
		bookId: e.bookId,
		label: e.label,
		notes: e.notes,
		color: e.color,
		hideMarker: e.hideMarker,
		deleted: false,
		createdAt: e.createdAt,
		updatedAt: e.updatedAt,
	};
}

// ---------------------------------------------------------------------------
// Sync lock - prevents concurrent pull/push from racing
// ---------------------------------------------------------------------------

let _syncQueue: Promise<void> = Promise.resolve();

async function withSyncLock(fn: () => Promise<void>): Promise<void> {
	const prev = _syncQueue;
	let resolve: (() => void) | undefined;
	_syncQueue = new Promise((r) => {
		resolve = r;
	});
	try {
		await prev;
		await fn();
	} finally {
		resolve?.();
	}
}

// ---------------------------------------------------------------------------
// Pull (GET /api/sync → merge into local DB)
// ---------------------------------------------------------------------------

/** Returns the set of bookIds the server has content for. */
export async function pullSync(): Promise<Set<string>> {
	const serverHasContent = new Set<string>();
	if (!SYNC_ENABLED) return serverHasContent;

	if (!IS_WEB_BUILD) {
		const token = await getToken();
		if (!token) return serverHasContent;
	}

	await withSyncLock(async () => {
		log("sync", "pulling...");

		// Tell server which books we already have (including local tombstones — server can skip content)
		const localBooks = await queries.getBooksForSync();
		const localBookMap = new Map(localBooks.map((b) => [b.id, b]));

		// Only standalone books carry content the server might omit; chapter rows
		// (seriesId set) and tombstones never have body content stored, so including
		// them in `have` is pointless and bloats the header. Heavy serial readers
		// can have 10k+ chapter rows — large enough to blow past HTTP/2's per-header
		// frame limit and trigger ERR_HTTP2_PROTOCOL_ERROR. (TASK-102)
		const haveHeader = localBooks
			.filter((b) => !b.seriesId && !b.deleted)
			.map((b) => b.id)
			.join(",");
		log("sync", `pull request haveCount=${localBooks.length} haveHeaderBytes=${haveHeader.length}`);

		const res = await syncFetch("/api/sync", {
			headers: { "X-Sync-Have": haveHeader },
		});
		const data: SyncResponse = await res.json();

		let changed = false;

		// --- Merge series (before books, so chapter rows can FK-reference them) ---
		const localSeries = await queries.getSeriesForSync();
		const localSeriesMap = new Map(localSeries.map((s) => [s.id, s]));

		// seriesId → bookIds index, built once so the tombstone-cascade branch
		// below can drop entries from `localBookMap` in O(chapters) rather than
		// rescanning every local book per tombstoned series. (TASK-102)
		const localBooksBySeries = new Map<string, string[]>();
		for (const b of localBooks) {
			if (!b.seriesId) continue;
			const arr = localBooksBySeries.get(b.seriesId);
			if (arr) arr.push(b.id);
			else localBooksBySeries.set(b.seriesId, [b.id]);
		}

		for (const serverSeries of data.series ?? []) {
			const local = localSeriesMap.get(serverSeries.seriesId);

			if (serverSeries.deleted) {
				// Cascade: drop any local chapter rows for this series (and their
				// content/highlights/glossary). The server cascade-tombstones them on
				// push, but we don't need to keep local tombstones around either.
				// (TASK-102)
				const removedChapters = await queries.hardDeleteChaptersBySeriesId(serverSeries.seriesId);
				if (removedChapters > 0) {
					for (const id of localBooksBySeries.get(serverSeries.seriesId) ?? []) {
						localBookMap.delete(id);
					}
					localBooksBySeries.delete(serverSeries.seriesId);
					changed = true;
				}
				if (local) {
					await queries.hardDeleteSeries(serverSeries.seriesId);
					localSeriesMap.delete(serverSeries.seriesId);
					changed = true;
				}
				continue;
			}

			if (!local) {
				await queries.addSeries({
					id: serverSeries.seriesId,
					title: serverSeries.title,
					author: serverSeries.author,
					coverImage: serverSeries.coverImage ?? null,
					description: serverSeries.description,
					sourceUrl: serverSeries.sourceUrl,
					tocUrl: serverSeries.tocUrl,
					provider: serverSeries.provider,
					lastCheckedAt: serverSeries.lastCheckedAt,
					createdAt: serverSeries.createdAt,
					deleted: false,
					updatedAt: serverSeries.updatedAt,
				});
				localSeriesMap.set(serverSeries.seriesId, {
					id: serverSeries.seriesId,
					title: serverSeries.title,
					author: serverSeries.author,
					coverImage: serverSeries.coverImage ?? null,
					description: serverSeries.description,
					sourceUrl: serverSeries.sourceUrl,
					tocUrl: serverSeries.tocUrl,
					provider: serverSeries.provider,
					lastCheckedAt: serverSeries.lastCheckedAt,
					createdAt: serverSeries.createdAt,
					deleted: false,
					updatedAt: serverSeries.updatedAt,
				});
				changed = true;
				continue;
			}

			// Local tombstone awaiting push: don't resurrect.
			if (local.deleted) continue;

			if (serverSeries.updatedAt > local.updatedAt) {
				await queries.updateSeries(serverSeries.seriesId, {
					title: serverSeries.title,
					author: serverSeries.author,
					coverImage: serverSeries.coverImage ?? null,
					description: serverSeries.description,
					tocUrl: serverSeries.tocUrl,
					lastCheckedAt: serverSeries.lastCheckedAt,
					updatedAt: serverSeries.updatedAt,
				});
				changed = true;
			}
		}

		// --- Merge books ---
		for (const serverBook of data.books) {
			const local = localBookMap.get(serverBook.bookId);

			// Server tombstone: hard-delete locally if present, then move on (no content needed).
			if (serverBook.deleted) {
				if (local) {
					await queries.hardDeleteBook(serverBook.bookId);
					localBookMap.delete(serverBook.bookId);
					changed = true;
				}
				continue;
			}

			// Server has content for this book if:
			// - content was returned in this response, OR
			// - the book is in our local DB (we sent it in `have`, server omitted content because it already has it)
			if (serverBook.content || localBookMap.has(serverBook.bookId)) {
				serverHasContent.add(serverBook.bookId);
			}

			if (!local) {
				// New book from server. Add if we have content, OR if it's a serial chapter
				// (pending chapters have empty content but still need a row to drive the UI).
				// Don't resurrect chapter rows for series the user has deleted locally
				// (or that don't exist locally because we cascaded). Without this, an
				// older server that hasn't cascade-tombstoned its chapter rows yet would
				// keep refilling the local DB. (TASK-102)
				if (serverBook.seriesId) {
					const parentSeries = localSeriesMap.get(serverBook.seriesId);
					if (!parentSeries || parentSeries.deleted) continue;
				}
				const isChapter = !!serverBook.seriesId;
				if (serverBook.content || isChapter) {
					const chapterStatus =
						isChapter && !serverBook.content ? "pending" : (serverBook.chapterStatus ?? "fetched");
					await queries.addBookWithContent(
						{
							id: serverBook.bookId,
							title: serverBook.title,
							author: serverBook.author,
							fileFormat: "txt", // synced content is always extracted plain text
							size: serverBook.fileSize ?? 0,
							position: serverBook.position,
							isActive: false,
							addedAt: serverBook.updatedAt,
							source: serverBook.source ?? null,
							catalogId: serverBook.catalogId ?? null,
							sourceUrl: serverBook.sourceUrl ?? null,
							seriesId: serverBook.seriesId ?? null,
							chapterIndex: serverBook.chapterIndex ?? null,
							chapterSourceUrl: serverBook.chapterSourceUrl ?? null,
							chapterStatus,
							chapterError: null,
						},
						serverBook.content ?? "",
						serverBook.coverImage,
						queries.parseChapters(serverBook.chapters ?? null),
					);
					// Track so highlights for this book aren't skipped
					localBookMap.set(serverBook.bookId, {
						id: serverBook.bookId,
						title: serverBook.title,
						author: serverBook.author,
						fileFormat: "txt",
						filePath: null,
						size: serverBook.fileSize ?? 0,
						position: serverBook.position,
						isActive: false,
						addedAt: serverBook.updatedAt,
						lastRead: null,
						source: serverBook.source ?? null,
						catalogId: serverBook.catalogId ?? null,
						sourceUrl: serverBook.sourceUrl ?? null,
						deleted: false,
						seriesId: serverBook.seriesId ?? null,
						chapterIndex: serverBook.chapterIndex ?? null,
						chapterSourceUrl: serverBook.chapterSourceUrl ?? null,
						chapterStatus,
						chapterError: null,
					});
					changed = true;
				}
				continue;
			}

			// Local tombstone awaiting push: don't let server data resurrect or bump it.
			// Remove from the local map so highlights for this book aren't merged either.
			if (local.deleted) {
				localBookMap.delete(serverBook.bookId);
				continue;
			}

			const localUpdatedAt = Math.max(local.lastRead ?? 0, local.addedAt);
			if (serverBook.updatedAt > localUpdatedAt) {
				await queries.updateBook(serverBook.bookId, {
					position: serverBook.position,
					lastRead: serverBook.updatedAt,
				});
				changed = true;
			}
		}

		// --- Merge settings ---
		if (data.settings) {
			const localSettings = await queries.getSettings();
			if (data.settings.updatedAt > localSettings.updatedAt) {
				await queries.saveSettings(pick(data.settings, SYNCED_SETTING_KEYS));
				changed = true;
			}
		}

		// --- Merge highlights ---
		const localHighlights = await queries.getAllHighlights();
		const localHighlightMap = new Map(localHighlights.map((h) => [h.id, h]));

		for (const serverHL of data.highlights) {
			if (serverHL.deleted) {
				// Server says deleted - remove locally if exists
				if (localHighlightMap.has(serverHL.highlightId)) {
					await queries.deleteHighlight(serverHL.highlightId);
					changed = true;
				}
				continue;
			}

			// Skip highlights for books not in local DB (avoids orphans)
			if (!localBookMap.has(serverHL.bookId)) continue;

			const local = localHighlightMap.get(serverHL.highlightId);
			if (!local) {
				// New highlight from server - add locally
				await queries.addHighlight({
					id: serverHL.highlightId,
					bookId: serverHL.bookId,
					startOffset: serverHL.startOffset,
					endOffset: serverHL.endOffset,
					color: serverHL.color,
					note: serverHL.note,
					text: serverHL.text ?? null,
					createdAt: serverHL.createdAt,
					updatedAt: serverHL.updatedAt,
				});
				changed = true;
			} else if (serverHL.updatedAt > local.updatedAt) {
				// Server is newer - update locally
				await queries.updateHighlight(serverHL.highlightId, {
					color: serverHL.color,
					note: serverHL.note,
					updatedAt: serverHL.updatedAt,
				});
				changed = true;
			}
		}

		// --- Merge glossary entries ---
		const localEntries = await queries.getAllEntries();
		const localEntryMap = new Map(localEntries.map((e) => [e.id, e]));

		for (const serverEntry of data.glossaryEntries ?? []) {
			if (serverEntry.deleted) {
				if (localEntryMap.has(serverEntry.entryId)) {
					await queries.deleteEntry(serverEntry.entryId);
					changed = true;
				}
				continue;
			}

			// Book-scoped entries for unknown books are skipped (orphan guard);
			// global entries (bookId === null) always merge.
			if (serverEntry.bookId !== null && !localBookMap.has(serverEntry.bookId)) continue;

			const local = localEntryMap.get(serverEntry.entryId);
			if (!local) {
				await queries.addEntry({
					id: serverEntry.entryId,
					bookId: serverEntry.bookId,
					label: serverEntry.label,
					notes: serverEntry.notes,
					color: serverEntry.color,
					hideMarker: serverEntry.hideMarker,
					createdAt: serverEntry.createdAt,
					updatedAt: serverEntry.updatedAt,
				});
				changed = true;
			} else if (serverEntry.updatedAt > local.updatedAt) {
				await queries.updateEntry(serverEntry.entryId, {
					label: serverEntry.label,
					notes: serverEntry.notes,
					color: serverEntry.color,
					bookId: serverEntry.bookId,
					hideMarker: serverEntry.hideMarker,
					updatedAt: serverEntry.updatedAt,
				});
				changed = true;
			}
		}

		// Invalidate React Query cache so UI reflects pulled changes
		if (changed) {
			queryClient.invalidateQueries({ queryKey: bookKeys.all });
			queryClient.invalidateQueries({ queryKey: settingsKeys.all });
			queryClient.invalidateQueries({ queryKey: glossaryKeys.all });
			queryClient.invalidateQueries({ queryKey: serialKeys.all });
		}

		log("sync", "pull complete");
	});

	return serverHasContent;
}

// ---------------------------------------------------------------------------
// Push (POST /api/sync with full snapshot)
// ---------------------------------------------------------------------------

/** @param serverHasContent bookIds the server already has content for - skip content for those */
export async function pushSync(serverHasContent: Set<string> = new Set()): Promise<void> {
	if (!SYNC_ENABLED) return;

	if (!IS_WEB_BUILD) {
		const token = await getToken();
		if (!token) return;
	}

	await withSyncLock(async () => {
		log("sync", "pushing...");

		const [books, settings, highlights, glossaryEntries, seriesRows] = await Promise.all([
			queries.getBooksForSync(),
			queries.getSettings(),
			queries.getAllHighlights(),
			queries.getAllEntries(),
			queries.getSeriesForSync(),
		]);

		// Fetch content only for books the server doesn't have yet (tombstones never carry content,
		// and chapter rows never sync content — see bookToSync).
		const booksWithContent = await Promise.all(
			books.map(async (book) => {
				if (book.deleted || book.seriesId || serverHasContent.has(book.id)) {
					return bookToSync(book);
				}
				const contentData = await queries.getBookContent(book.id);
				return bookToSync(book, contentData);
			}),
		);

		const payload: SyncPayload = {
			books: booksWithContent,
			settings: settingsToSync(settings),
			highlights: highlights.map(highlightToSync),
			glossaryEntries: glossaryEntries.map(entryToSync),
			series: seriesRows.map(seriesToSync),
		};

		// Diagnostics for the >5000 books cap — log composition so we can see what's
		// driving the count (chapter rows from large serials vs. standalone imports).
		// (TASK-102)
		const chapterRowCount = booksWithContent.filter((b) => b.seriesId).length;
		const standaloneCount = booksWithContent.length - chapterRowCount;
		const chaptersPerSeries = new Map<string, number>();
		for (const b of booksWithContent) {
			if (b.seriesId)
				chaptersPerSeries.set(b.seriesId, (chaptersPerSeries.get(b.seriesId) ?? 0) + 1);
		}
		const topSeries = [...chaptersPerSeries.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([id, n]) => `${id}:${n}`);
		const body = JSON.stringify(payload);
		log(
			"sync",
			`push payload books=${booksWithContent.length} standalone=${standaloneCount} chapterRows=${chapterRowCount} highlights=${payload.highlights.length} glossaryEntries=${payload.glossaryEntries.length} series=${payload.series?.length ?? 0} bodyBytes=${body.length} topSeries=[${topSeries.join(",")}]`,
		);

		await syncFetch("/api/sync", {
			method: "POST",
			body,
		});

		await Preferences.set({
			key: LAST_SYNCED_KEY,
			value: String(Date.now()),
		});

		log("sync", "push complete");
	});
}

// ---------------------------------------------------------------------------
// Full sync (pull then push)
// ---------------------------------------------------------------------------

export async function fullSync(): Promise<void> {
	const serverHasContent = await pullSync();
	await pushSync(serverHasContent);
}

// ---------------------------------------------------------------------------
// Debounced push - callable from mutation hooks
// ---------------------------------------------------------------------------

let _pushTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSyncPush(delayMs = 2000): void {
	if (!SYNC_ENABLED) return;

	if (_pushTimer) clearTimeout(_pushTimer);
	_pushTimer = setTimeout(() => {
		_pushTimer = null;
		pushSync().catch((err) => log.error("sync", "debounced push failed:", err));
	}, delayMs);
}
