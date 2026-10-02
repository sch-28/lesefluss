// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { cleanTitle, cleanTitleSql, MARC_SUBFIELD_SQL_PATTERN } from "../display.js";

const hasDb = Boolean(process.env.DATABASE_URL);

const TITLES = [
	"Ancient law : $b its connection with the early history of society",
	"The possessed $b or, The devils",
	"A title : $b sub : $c by someone",
	"Dress design $b: an account of costume",
	"Poems $b; with notes",
	"A title : $b: sub",
	"Unfinished $b",
	"Unfinished : $b",
	"The $30,000 Bequest",
	"Pride and Prejudice",
];

let db: typeof import("../../db/index.js").db;

describe.skipIf(!hasDb)("cleanTitleSql (integration)", () => {
	beforeAll(async () => {
		db = (await import("../../db/index.js")).db;
	});

	it("cleans stored titles exactly like cleanTitle", async () => {
		for (const title of TITLES) {
			const { rows } = await db.execute<{ cleaned: string; dirty: boolean }>(
				sql`SELECT ${cleanTitleSql(sql`${title}::text`)} AS cleaned, ${title} ~ ${MARC_SUBFIELD_SQL_PATTERN} AS dirty`,
			);
			expect(rows[0]?.cleaned, title).toBe(cleanTitle(title));
			expect(rows[0]?.dirty, title).toBe(cleanTitle(title) !== title);
		}
	});
});
