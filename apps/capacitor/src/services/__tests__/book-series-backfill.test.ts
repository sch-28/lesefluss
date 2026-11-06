import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: vi.fn(() => "web") } }));
vi.mock("@capacitor/preferences", () => ({ Preferences: {} }));
vi.mock("../db/queries", () => ({ queries: {} }));
vi.mock("../sync", () => ({ scheduleSyncPush: vi.fn() }));
vi.mock("../telemetry", () => ({ reportEvent: vi.fn() }));
vi.mock("../query-client", () => ({ queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("../book-import/sources/read-file", () => ({ readOriginalFile: vi.fn() }));

const { readEpubSeries, runSeriesBackfill, startSeriesBackfill } = await import(
	"../book-series-backfill"
);
const { Capacitor } = await import("@capacitor/core");
const { scheduleSyncPush } = await import("../sync");
const { reportEvent } = await import("../telemetry");
type Deps = Parameters<typeof runSeriesBackfill>[0];

type Book = { id: string; filePath: string; seriesName: string | null };

/** A device with a library and a Preferences store; `readSeries` answers per file. */
function device(
	books: Book[],
	read: Record<string, { seriesName: string | null; seriesIndex: number | null } | Error>,
	prefs: { done?: boolean; cursor?: string | null } = {},
) {
	const state = { done: prefs.done ?? false, cursor: prefs.cursor ?? null };
	const filled: Array<[string, unknown]> = [];
	const reads: string[] = [];
	const deps: Deps = {
		isDone: async () => state.done,
		readCursor: async () => state.cursor,
		saveCursor: async (id) => {
			state.cursor = id;
		},
		markDone: async () => {
			state.done = true;
			state.cursor = null;
		},
		candidates: async (afterId, limit) =>
			books
				.filter((b) => b.seriesName === null && (afterId === null || b.id > afterId))
				.sort((a, b) => a.id.localeCompare(b.id))
				.slice(0, limit)
				.map(({ id, filePath }) => ({ id, filePath })),
		readSeries: async (filePath) => {
			reads.push(filePath);
			const answer = read[filePath];
			if (answer instanceof Error) throw answer;
			return answer ?? { seriesName: null, seriesIndex: null };
		},
		fill: async (id, series) => {
			filled.push([id, series]);
			const book = books.find((b) => b.id === id);
			if (book) book.seriesName = series.seriesName;
		},
		pause: async () => {},
	};
	return { deps, state, filled, reads };
}

describe("runSeriesBackfill", () => {
	it("fills books whose EPUB names a series and marks the device done", async () => {
		const { deps, state, filled } = device(
			[
				{ id: "a", filePath: "books/a.epub", seriesName: null },
				{ id: "b", filePath: "books/b.epub", seriesName: null },
			],
			{ "books/a.epub": { seriesName: "Red Rising", seriesIndex: 3 } },
		);
		expect(await runSeriesBackfill(deps)).toEqual({ filled: 1, noSeries: 1, failed: 0 });
		expect(filled).toEqual([["a", { seriesName: "Red Rising", seriesIndex: 3 }]]);
		expect(state).toEqual({ done: true, cursor: null });
	});

	it("does not run again once done", async () => {
		const { deps, reads } = device(
			[{ id: "a", filePath: "books/a.epub", seriesName: null }],
			{},
			{
				done: true,
			},
		);
		expect(await runSeriesBackfill(deps)).toBeNull();
		expect(reads).toEqual([]);
	});

	it("skips a missing or unreadable file and keeps going", async () => {
		const { deps, filled } = device(
			[
				{ id: "a", filePath: "books/a.epub", seriesName: null },
				{ id: "b", filePath: "books/b.epub", seriesName: null },
			],
			{
				"books/a.epub": new Error("FILE_READ_FAILED"),
				"books/b.epub": { seriesName: "Dune", seriesIndex: 1 },
			},
		);
		expect(await runSeriesBackfill(deps)).toEqual({ filled: 1, noSeries: 0, failed: 1 });
		expect(filled.map(([id]) => id)).toEqual(["b"]);
	});

	it("never fills a name-less number", async () => {
		const { deps, filled } = device([{ id: "a", filePath: "books/a.epub", seriesName: null }], {
			"books/a.epub": { seriesName: null, seriesIndex: 2 },
		});
		await runSeriesBackfill(deps);
		expect(filled).toEqual([]);
	});

	it("resumes after the saved cursor when a run was cut short", async () => {
		const books = Array.from({ length: 45 }, (_, i) => ({
			id: `b${String(i).padStart(2, "0")}`,
			filePath: `books/${i}.epub`,
			seriesName: null,
		}));
		const first = device(books, {});
		let reads = 0;
		const failing: Deps = {
			...first.deps,
			readSeries: async (path) => {
				if (++reads > 25) throw new Error("app killed");
				return first.deps.readSeries(path);
			},
			saveCursor: async (id) => {
				if (reads > 25) throw new Error("app killed");
				await first.deps.saveCursor(id);
			},
		};
		await expect(runSeriesBackfill(failing)).rejects.toThrow("app killed");
		expect(first.state).toEqual({ done: false, cursor: "b24" });

		first.reads.length = 0;
		await runSeriesBackfill(first.deps);
		expect(first.reads[0]).toBe("books/25.epub");
		expect(first.reads).toHaveLength(20);
		expect(first.state.done).toBe(true);
	});
});

describe("readEpubSeries", () => {
	async function epub(opf: string, opfPath = "OEBPS/content.opf") {
		const zip = new JSZip();
		zip.file(
			"META-INF/container.xml",
			`<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles></container>`,
		);
		zip.file(opfPath, opf);
		return zip.generateAsync({ type: "arraybuffer" });
	}
	const opf = (meta: string) =>
		`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title>${meta}</metadata></package>`;

	it("reads the series the OPF declares", async () => {
		const bytes = await epub(
			opf(
				'<meta name="calibre:series" content="Red Rising"/><meta name="calibre:series_index" content="3"/>',
			),
		);
		expect(await readEpubSeries(bytes)).toEqual({ seriesName: "Red Rising", seriesIndex: 3 });
	});

	it("gives no series for an EPUB without one", async () => {
		expect(await readEpubSeries(await epub(opf("")))).toEqual({
			seriesName: null,
			seriesIndex: null,
		});
	});

	it("throws for a file that is not an EPUB", async () => {
		await expect(readEpubSeries(new TextEncoder().encode("plain text").buffer)).rejects.toThrow();
		const zip = new JSZip();
		zip.file("hello.txt", "hi");
		await expect(readEpubSeries(await zip.generateAsync({ type: "arraybuffer" }))).rejects.toThrow(
			"EPUB_NO_CONTAINER",
		);
	});
});

describe("startSeriesBackfill", () => {
	it("does nothing off Android", async () => {
		const { deps } = device([], {});
		const isDone = vi.fn(deps.isDone);
		vi.useFakeTimers();
		try {
			startSeriesBackfill({ ...deps, isDone });
			await vi.runAllTimersAsync();
		} finally {
			vi.useRealTimers();
		}
		expect(isDone).not.toHaveBeenCalled();
	});

	it("runs once per app start on Android and pushes what it filled", async () => {
		vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
		const { deps, filled } = device([{ id: "a", filePath: "books/a.epub", seriesName: null }], {
			"books/a.epub": { seriesName: "Dune", seriesIndex: 1 },
		});
		const isDone = vi.fn(deps.isDone);
		vi.useFakeTimers();
		try {
			startSeriesBackfill({ ...deps, isDone });
			startSeriesBackfill({ ...deps, isDone });
			await vi.runAllTimersAsync();
		} finally {
			vi.useRealTimers();
		}
		expect(isDone).toHaveBeenCalledTimes(1);
		expect(filled).toHaveLength(1);
		expect(scheduleSyncPush).toHaveBeenCalledTimes(1);
		expect(reportEvent).toHaveBeenCalledWith("series_backfill", {
			extra: { filled: 1, noSeries: 0, failed: 0 },
		});
	});
});
