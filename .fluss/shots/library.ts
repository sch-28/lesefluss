import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Page } from "@playwright/test";
import { buildEpubBuffer } from "../../packages/book-import/src/test-fixtures/build-epub";
import type { ShotContext } from "./define";

const ROOT = join(dirname(__filename), "../..");
const DAY = 86_400_000;

// The capture's context has no baseURL; every ref serves on its own port.
let baseUrl = "";
const at = (path: string) => new URL(path, baseUrl).href;

// tsx compiles with keepNames, so functions sent to the browser call a __name helper the page lacks.
const NAME_SHIM = "globalThis.__name ??= (fn) => fn";
async function visitBlank(page: Page): Promise<void> {
	await page.goto(at("/favicon.png"));
	await page.evaluate(NAME_SHIM);
}

export type DataState = "empty" | "few" | "full";

type Book = {
	title: string;
	author: string;
	/** Share read, 0..1; null leaves the book unopened. */
	read: number | null;
	addedDaysAgo: number;
	lastReadDaysAgo?: number;
	series?: [name: string, index: number];
};

/** The first three are the "few" library; every ref imports them in this order. */
const BOOKS: Book[] = [
	{
		title: "The Time Machine",
		author: "H. G. Wells",
		read: 0.45,
		addedDaysAgo: 30,
		lastReadDaysAgo: 0,
	},
	{
		title: "Pride and Prejudice",
		author: "Jane Austen",
		read: 0.12,
		addedDaysAgo: 21,
		lastReadDaysAgo: 3,
	},
	{ title: "Moby Dick", author: "Herman Melville", read: null, addedDaysAgo: 2 },
	{ title: "Frankenstein", author: "Mary Shelley", read: 1, addedDaysAgo: 60, lastReadDaysAgo: 20 },
	{ title: "Dracula", author: "Bram Stoker", read: 0.7, addedDaysAgo: 45, lastReadDaysAgo: 1 },
	{
		title: "The Warden",
		author: "Anthony Trollope",
		read: 1,
		addedDaysAgo: 90,
		lastReadDaysAgo: 40,
		series: ["Chronicles of Barsetshire", 1],
	},
	{
		title: "Barchester Towers",
		author: "Anthony Trollope",
		read: null,
		addedDaysAgo: 89,
		series: ["Chronicles of Barsetshire", 2],
	},
	{
		title: "The Adventures of Sherlock Holmes",
		author: "Arthur Conan Doyle",
		read: 0.3,
		addedDaysAgo: 12,
		lastReadDaysAgo: 6,
	},
];
const FEW = 3;

// Public domain (Wells, 1895), so the reader shows real prose on both refs.
const PROSE = [
	"The Time Traveller (for so it will be convenient to speak of him) was expounding a recondite matter to us. His grey eyes shone and twinkled, and his usually pale face was flushed and animated. The fire burned brightly, and the soft radiance of the incandescent lights in the lilies of silver caught the bubbles that flashed and passed in our glasses.",
	"Our chairs, being his patents, embraced and caressed us rather than submitted to be sat upon, and there was that luxurious after-dinner atmosphere when thought roams gracefully free of the trammels of precision. And he put it to us in this way, marking the points with a lean forefinger, as we sat and lazily admired his earnestness over this new paradox, as we thought it, and his fecundity.",
	"You must follow me carefully. I shall have to controvert one or two ideas that are almost universally accepted. The geometry, for instance, they taught you at school is founded on a misconception. Is not that rather a large thing to expect us to begin upon? said Filby, an argumentative person with red hair.",
	"I do not mean to ask you to accept anything without reasonable ground for it. You will soon admit as much as I need from you. You know of course that a mathematical line, a line of thickness nil, has no real existence. They taught you that? Neither has a mathematical plane. These things are mere abstractions.",
];

function epub(book: Book) {
	const chapters = ["I", "II", "III", "IV"].map((n, c) => ({
		id: `c${c + 1}`,
		href: `c${c + 1}.xhtml`,
		title: `Chapter ${n}`,
		// Text unique per book keeps the import from offering to attach it to an earlier one.
		body: `<h2>Chapter ${n}</h2>${c === 0 ? `<p>${book.title}, by ${book.author}.</p>` : ""}${PROSE.map((p, i) => `<p>${PROSE[(i + c) % PROSE.length] ?? p}</p>`).join("")}`,
	}));
	return buildEpubBuffer({
		title: book.title,
		creator: book.author,
		chapters,
		navPoints: chapters.map((c) => ({ label: c.title, href: c.href })),
	});
}

async function waitForLibrary(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Add book" }).first().waitFor({ timeout: 30_000 });
}

/** The real file picker and confirm sheet, as the e2e import does; both refs take the same path. */
async function importBook(page: Page, book: Book): Promise<void> {
	await page.goto(at("/tabs/library"));
	await waitForLibrary(page);
	await page.getByRole("button", { name: "Add book" }).first().click();
	const chooser = page.waitForEvent("filechooser");
	await page
		.getByRole("menuitem", { name: /^Import file/ })
		.or(page.getByRole("button", { name: /^Import file/ }))
		.first()
		.click();
	await (await chooser).setFiles({
		name: `${book.title}.epub`,
		mimeType: "application/epub+zip",
		buffer: await epub(book),
	});
	await page.getByRole("button", { name: "Add to library" }).click({ timeout: 20_000 });
	await page.locator(`[data-book-title="${book.title}"]`).first().waitFor({ timeout: 20_000 });
}

type Storage = { bytes: string; local: Record<string, string> };

/**
 * Reads the database with the app closed (on a static file): the OPFS pool file
 * from 2.2.0 on (data after the 4096-byte header), the jeep IndexedDB store before.
 */
async function readStore(page: Page): Promise<Storage> {
	await visitBlank(page);
	for (let attempt = 0; ; attempt++) {
		try {
			return await page.evaluate(async () => {
				const toBase64 = async (blob: Blob) => {
					const bytes = new Uint8Array(await blob.arrayBuffer());
					let s = "";
					for (let i = 0; i < bytes.length; i += 0x8000)
						s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
					return btoa(s);
				};
				const local = { ...localStorage };
				const opfs = await navigator.storage.getDirectory();
				const root = await opfs.getDirectoryHandle("lesefluss").catch(() => null);
				const active =
					root &&
					(await root.getFileHandle("opfs-active").then(
						() => true,
						() => false,
					));
				if (root && active) {
					const pool = await root.getDirectoryHandle("sahpool");
					const opaque = await pool.getDirectoryHandle(".opaque");
					// biome-ignore lint/suspicious/noExplicitAny: FileSystemDirectoryHandle.values() is missing from the DOM lib
					for await (const handle of (opaque as any).values() as AsyncIterable<FileSystemHandle>) {
						if (handle.kind !== "file") continue;
						const file = await (handle as FileSystemFileHandle).getFile();
						const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
						const end = head.indexOf(0);
						const path = new TextDecoder().decode(head.subarray(0, end < 0 ? 512 : end));
						if (path === "/leseflussSQLite.db")
							return { bytes: await toBase64(file.slice(4096)), local };
					}
					throw new Error("no database file in the OPFS pool");
				}
				// Opening a store jeep has not created yet would create it empty, without its object store.
				const names = (await indexedDB.databases()).map((d) => d.name);
				if (!names.includes("jeepSqliteStore")) throw new Error("no jeep store yet");
				const db = await new Promise<IDBDatabase>((resolve, reject) => {
					const req = indexedDB.open("jeepSqliteStore");
					req.onsuccess = () => resolve(req.result);
					req.onerror = () => reject(req.error);
				});
				const value = await new Promise<unknown>((resolve, reject) => {
					const req = db
						.transaction("databases")
						.objectStore("databases")
						.get("leseflussSQLite.db");
					req.onsuccess = () => resolve(req.result);
					req.onerror = () => reject(req.error);
				});
				db.close();
				if (!(value instanceof Uint8Array)) throw new Error("no database in the jeep store");
				return { bytes: await toBase64(new Blob([value])), local };
			});
		} catch (error) {
			// The closed page's worker can hold the pool's access handles for a moment.
			if (attempt >= 20) throw error;
			await page.waitForTimeout(250);
		}
	}
}

/** As the e2e `resetStorage`: on a static file, so no database worker holds what it deletes. */
async function wipe(page: Page): Promise<void> {
	await visitBlank(page);
	await page.evaluate(async () => {
		for (const info of await indexedDB.databases()) {
			const name = info.name;
			if (name)
				await new Promise((resolve) => {
					const req = indexedDB.deleteDatabase(name);
					req.onsuccess = req.onerror = req.onblocked = resolve;
				});
		}
		const opfs = await navigator.storage.getDirectory();
		await opfs.removeEntry("lesefluss", { recursive: true }).catch(() => {});
		localStorage.clear();
		sessionStorage.clear();
	});
}

/**
 * Wipes the context's storage and puts `bytes` in the jeep store with no OPFS
 * marker: a ref with the jeep driver reads it as is, a later one moves it to
 * OPFS through its own legacy-store import on boot.
 */
async function writeStore(page: Page, storage: Storage): Promise<void> {
	await visitBlank(page);
	for (let attempt = 0; ; attempt++) {
		try {
			await page.evaluate(async ({ bytes, local }) => {
				const done = (req: IDBRequest | IDBOpenDBRequest) =>
					new Promise<void>((resolve, reject) => {
						req.onsuccess = () => resolve();
						req.onerror = () => reject(req.error);
					});
				for (const info of await indexedDB.databases()) {
					if (info.name) {
						const req = indexedDB.deleteDatabase(info.name);
						await new Promise<void>((resolve, reject) => {
							req.onsuccess = () => resolve();
							req.onblocked = () => reject(new Error(`${info.name} is still open`));
							req.onerror = () => reject(req.error);
						});
					}
				}
				const opfs = await navigator.storage.getDirectory();
				const root = await opfs.getDirectoryHandle("lesefluss").catch(() => null);
				if (root) {
					await root.removeEntry("sahpool", { recursive: true }).catch((e: DOMException) => {
						if (e.name !== "NotFoundError") throw e;
					});
					await root.removeEntry("opfs-active").catch(() => {});
				}
				localStorage.clear();
				sessionStorage.clear();
				for (const [key, value] of Object.entries(local)) localStorage.setItem(key, value);
				const raw = atob(bytes);
				const data = new Uint8Array(raw.length);
				for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
				const open = indexedDB.open("jeepSqliteStore", 1);
				open.onupgradeneeded = () => open.result.createObjectStore("databases");
				await done(open);
				const db = open.result;
				const tx = db.transaction("databases", "readwrite");
				tx.objectStore("databases").put(data, "leseflussSQLite.db");
				await new Promise<void>((resolve, reject) => {
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				});
				db.close();
			}, storage);
			return;
		} catch (error) {
			if (attempt >= 20) throw error;
			await page.waitForTimeout(250);
		}
	}
}

type SqlDb = {
	exec(sql: string, params?: unknown[]): { columns: string[]; values: unknown[][] }[];
	run(sql: string, params?: unknown[]): void;
	export(): Uint8Array;
	close(): void;
};
type Sql = { Database: new (data?: Uint8Array) => SqlDb };

function sqlJs(): Promise<Sql> {
	const init = createRequire(join(ROOT, "apps/capacitor/package.json"))(
		"sql.js",
	) as () => Promise<Sql>;
	return init();
}

const columnsOf = (db: SqlDb, table: string) =>
	new Set(db.exec(`PRAGMA table_info(${table})`)[0]?.values.map((row) => String(row[1])) ?? []);

/** Writes only the columns this ref's table has, so one seed fits every schema since v2.1.1. */
function upsert(db: SqlDb, table: string, row: Record<string, unknown>): void {
	const have = columnsOf(db, table);
	if (!have.size) return;
	const keys = Object.keys(row).filter((k) => have.has(k));
	db.run(
		`INSERT OR REPLACE INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
		keys.map((k) => row[k]),
	);
}

function update(
	db: SqlDb,
	table: string,
	set: Record<string, unknown>,
	where: string,
	params: unknown[],
) {
	const have = columnsOf(db, table);
	const keys = Object.keys(set).filter((k) => have.has(k));
	if (!keys.length) return;
	db.run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE ${where}`, [
		...keys.map((k) => set[k]),
		...params,
	]);
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Puts the same dates, progress, sessions and goal into every ref's database,
 * relative to the capture's fixed clock: an import stamps every book with that
 * same instant, which leaves the library order to chance.
 */
function normalize(db: SqlDb, now: number, state: DataState): void {
	update(
		db,
		"settings",
		{ onboarding_completed: 1, last_seen_changelog_date: "9999-12-31" },
		"1 = 1",
		[],
	);
	if (state === "empty") return;
	const ids = new Map<string, { id: string; words: number }>();
	for (const [id, title, words] of db.exec("SELECT id, title, word_count FROM books")[0]?.values ??
		[])
		ids.set(String(title), { id: String(id), words: Number(words) });
	for (const book of BOOKS) {
		const row = ids.get(book.title);
		if (!row) continue;
		const ago = (days: number | undefined) =>
			days === undefined ? null : now - days * DAY - 3_600_000;
		const position = book.read === null ? 0 : Math.round(row.words * book.read);
		update(
			db,
			"books",
			{
				added_at: now - book.addedDaysAgo * DAY,
				last_read: ago(book.lastReadDaysAgo),
				word_position: position,
				first_sitting_at: book.read === null ? null : now - (book.addedDaysAgo - 1) * DAY,
				finished_at: book.read === 1 ? ago(book.lastReadDaysAgo) : null,
				updated_at: ago(book.lastReadDaysAgo) ?? now - book.addedDaysAgo * DAY,
				series_name: book.series?.[0] ?? null,
				series_index: book.series?.[1] ?? null,
				status: book.read === null && book.series ? "want" : null,
			},
			"id = ?",
			[row.id],
		);
	}
	const reading = BOOKS.filter((b) => b.read !== null && b.read < 1 && ids.has(b.title));
	for (let day = 13; day >= 0; day--) {
		if (day % 4 === 2) continue;
		const book = reading[day % reading.length] as Book;
		const { id, words } = ids.get(book.title) as { id: string; words: number };
		const started = now - day * DAY - 5 * 3_600_000;
		const minutes = 12 + ((day * 7) % 25);
		const read = minutes * 230;
		upsert(db, "reading_sessions", {
			id: `shot${String(day).padStart(4, "0")}`,
			book_id: id,
			mode: day % 3 === 0 ? "rsvp" : "scroll",
			started_at: started,
			ended_at: started + minutes * 60_000,
			duration_ms: minutes * 60_000,
			words_read: read,
			start_word: Math.round(words * (book.read as number) * ((14 - day - 1) / 14)),
			end_word: Math.round(words * (book.read as number) * ((14 - day) / 14)),
			furthest_word: Math.round(words * (book.read as number) * ((14 - day) / 14)),
			wpm_avg: 230 + (day % 5) * 15,
			updated_at: started + minutes * 60_000,
		});
	}
	const goalBook = ids.get(BOOKS[0]?.title as string);
	if (goalBook)
		upsert(db, "reading_goals", {
			id: "shotgoal",
			book_id: goalBook.id,
			mode: "deadline",
			status: "active",
			started_at: now - 7 * DAY,
			start_word: Math.round(goalBook.words * 0.2),
			plan_start_date: isoDay(now - 7 * DAY),
			plan_start_word: Math.round(goalBook.words * 0.2),
			target_date: isoDay(now + 14 * DAY),
			daily_percent: 4,
			carried_days_met: 0,
			deleted: 0,
			created_at: now - 7 * DAY,
			updated_at: now - 7 * DAY,
		});
	if (state !== "full") return;
	const members = ["Frankenstein", "Dracula", "The Time Machine"].flatMap(
		(t) => ids.get(t)?.id ?? [],
	);
	upsert(db, "collections", {
		id: COLLECTION_ID,
		name: "Gothic and strange",
		sort_order: 1,
		ordered: 0,
		deleted: 0,
		created_at: now - 10 * DAY,
		updated_at: now - 10 * DAY,
	});
	members.forEach((memberId, i) => {
		upsert(db, "collection_books", {
			collection_id: COLLECTION_ID,
			book_id: memberId,
			position: i + 1,
			deleted: 0,
			updated_at: now - 10 * DAY,
		});
	});
	upsert(db, "series", {
		id: SERIAL_ID,
		title: "The Lantern Road",
		author: "M. Ashdown",
		description: "A courier walks the last lit road between two dying cities.",
		source_url: "https://www.royalroad.com/fiction/0/the-lantern-road",
		toc_url: "https://www.royalroad.com/fiction/0/the-lantern-road",
		provider: "royalroad",
		last_checked_at: now - DAY,
		created_at: now - 8 * DAY,
		deleted: 0,
		updated_at: now - 8 * DAY,
	});
	["Departure", "The Toll Bridge", "Ash and Oil", "Night Market"].forEach((title, i) => {
		upsert(db, "books", {
			id: `5e7ac00${i}`,
			title,
			author: "M. Ashdown",
			file_format: "html",
			size: 0,
			word_position: i === 0 ? 2400 : 0,
			word_count: 2400 + i * 300,
			is_active: 0,
			added_at: now - 8 * DAY,
			last_read: i === 0 ? now - 2 * DAY : null,
			deleted: 0,
			series_id: SERIAL_ID,
			chapter_index: i,
			chapter_source_url: `https://www.royalroad.com/fiction/0/chapter/${i}`,
			chapter_status: "fetched",
			source: "serial",
			updated_at: now - 8 * DAY,
		});
	});
}

export const COLLECTION_ID = "5h075c01";
export const SERIAL_ID = "5e7a1000";

function themed(base: Uint8Array, theme: string): Uint8Array {
	return withDb(base, (db) => update(db, "settings", { reader_theme: theme }, "1 = 1", []));
}

let SQL: Sql | null = null;
function withDb(bytes: Uint8Array, change: (db: SqlDb) => void): Uint8Array {
	const db = new (SQL as Sql).Database(bytes);
	try {
		change(db);
		return db.export();
	} finally {
		db.close();
	}
}

type Library = {
	states: Map<DataState, Storage>;
	current: string | null;
	ids: Map<string, string>;
};

/** Per ref and context: the capture runs one ref per process, phone before desktop. */
const libraries = new Map<string, Library>();
// The capture's phone context covers every size up to this width.
const PHONE_MAX = 1023;
const libraryKey = (ctx: ShotContext) =>
	`${ctx.ref.sha ?? ctx.ref.label}:${ctx.size <= PHONE_MAX ? "phone" : "desktop"}`;

function decode(storage: Storage): Uint8Array {
	return new Uint8Array(Buffer.from(storage.bytes, "base64"));
}

/** Imports the books through the app's own UI and keeps the database empty, with a few and with all books. */
export async function seedLibrary(page: Page, ctx: ShotContext): Promise<void> {
	baseUrl = ctx.baseUrl;
	SQL ??= await sqlJs();
	await wipe(page);
	await page.goto(at("/tabs/library"));
	await waitForLibrary(page);
	const raw = new Map<DataState, Storage>();
	raw.set("empty", await readStore(page));
	for (const book of BOOKS.slice(0, FEW)) await importBook(page, book);
	raw.set("few", await readStore(page));
	for (const book of BOOKS.slice(FEW)) await importBook(page, book);
	raw.set("full", await readStore(page));
	const now = ctx.now.getTime();
	const states = new Map<DataState, Storage>();
	const ids = new Map<string, string>();
	for (const [state, storage] of raw) {
		const bytes = withDb(decode(storage), (db) => {
			normalize(db, now, state);
			if (state === "full")
				for (const [id, title] of db.exec("SELECT id, title FROM books")[0]?.values ?? [])
					ids.set(String(title), String(id));
		});
		states.set(state, { bytes: Buffer.from(bytes).toString("base64"), local: storage.local });
	}
	libraries.set(libraryKey(ctx), { states, current: null, ids });
}

/**
 * Restores `state` in the requested theme unless the context already holds it;
 * `dirty` screens (the reader) write to the database, so the next one restores again.
 */
export async function ensureLibrary(
	page: Page,
	ctx: ShotContext,
	state: DataState,
	opts: { dirty?: boolean } = {},
): Promise<void> {
	baseUrl = ctx.baseUrl;
	const library = libraries.get(libraryKey(ctx));
	if (!library) throw new Error("the seed did not run for this context");
	const want = `${state}:${ctx.theme}`;
	if (library.current !== want) {
		const storage = library.states.get(state) as Storage;
		const bytes = themed(decode(storage), ctx.theme);
		library.current = null;
		await writeStore(page, { bytes: Buffer.from(bytes).toString("base64"), local: storage.local });
	}
	library.current = opts.dirty ? null : want;
}

export function bookId(ctx: ShotContext, title: string): string {
	const id = libraries.get(libraryKey(ctx))?.ids.get(title);
	if (!id) throw new Error(`no seeded book "${title}"`);
	return id;
}
