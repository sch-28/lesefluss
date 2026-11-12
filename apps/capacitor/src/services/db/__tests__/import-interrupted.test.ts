// @vitest-environment node
/**
 * A page that closes mid-import stops its statements wherever they are, with
 * no cleanup after. The next start must find the old library or the new one,
 * never a book with half its text.
 */
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_TEXT_CHUNK } from "../long-text";
import * as schema from "../schema";
import { createTestDb } from "./test-db";

const { raw, close } = createTestDb();
const page = { statementsLeft: Number.POSITIVE_INFINITY };

/** test-db's proxy, with a page that stops answering after `statementsLeft` statements. */
const db = drizzle<typeof schema>(
	async (sql, params, method) => {
		if (page.statementsLeft-- <= 0) throw new Error("page closed");
		const values = params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p)) as never[];
		const statement = raw.prepare(sql);
		if (method === "run") {
			statement.run(...values);
			return { rows: [] };
		}
		const rows = statement.all(...values) as Array<Record<string, unknown>>;
		if (method === "get") return { rows: rows[0] ? Object.values(rows[0]) : [] };
		return { rows: rows.map((row) => Object.values(row)) };
	},
	{ schema },
);
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { addBookWithContent, deleteOrphanedContentRows, getBooks } = await import(
	"../queries/books"
);

const BIG = `${"word ".repeat(Math.ceil((LONG_TEXT_CHUNK * 2.5) / 5))}`.trim();

function book(id: string, content: string) {
	return {
		id,
		title: `Book ${id}`,
		fileFormat: "txt",
		size: Buffer.byteLength(content),
		isActive: false,
		addedAt: 1,
		updatedAt: 1,
		metadataUpdatedAt: 1,
	};
}

function count(table: string): number {
	return (raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

beforeEach(() => {
	page.statementsLeft = Number.POSITIVE_INFINITY;
	raw.exec("DELETE FROM book_images; DELETE FROM book_content; DELETE FROM books;");
});

describe("an import cut off by a closing page", () => {
	it("never shows the book while its text is only partly written", async () => {
		await addBookWithContent(book("old", "Kept."), "Kept.");

		for (let cutAfter = 0; cutAfter < 6; cutAfter++) {
			page.statementsLeft = cutAfter;
			await addBookWithContent(book(`new${cutAfter}`, BIG), BIG).catch(() => {});
			page.statementsLeft = Number.POSITIVE_INFINITY;
			expect((await getBooks()).map((b) => b.id)).toEqual(["old"]);
		}
	});

	it("leaves content rows the next start clears, without touching complete books", async () => {
		await addBookWithContent(book("old", "Kept."), "Kept.");
		page.statementsLeft = 2;
		await addBookWithContent(book("cut", BIG), BIG).catch(() => {});
		page.statementsLeft = Number.POSITIVE_INFINITY;
		raw
			.prepare(
				"INSERT INTO book_images (book_id, key, mime, width, height, is_line_art, data) VALUES ('cut', 'k', 'image/png', 1, 1, 0, 'QQ==')",
			)
			.run();
		expect(count("book_content")).toBe(2);

		expect(await deleteOrphanedContentRows()).toBe(1);
		expect(count("book_content")).toBe(1);
		expect(count("book_images")).toBe(0);
		expect(await deleteOrphanedContentRows()).toBe(0);
	});

	it("an import that finishes lands the book with all of its text", async () => {
		await addBookWithContent(book("whole", BIG), BIG);
		const row = raw.prepare("SELECT content FROM book_content WHERE book_id = 'whole'").get() as {
			content: string;
		};
		expect(row.content).toBe(BIG);
		expect((await getBooks()).map((b) => b.id)).toEqual(["whole"]);
	});
});
