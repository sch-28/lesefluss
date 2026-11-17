import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { captureException } from "./error-tracking.js";
import { GENRES, genrePatternsSql } from "./genres.js";

export type GenreCount = { id: string; label: string; count: number };

/** Counts per primary language subtag (`en` holds `en-GB` too) and `all`, in `GENRES` order. */
export type GenreCountsByLanguage = Map<string, number[]>;

/** Subjects change only when a sync runs, which refreshes the counts itself. */
export const GENRE_COUNTS_TTL_MS = 24 * 60 * 60 * 1000;

type LanguageRow = { lang: string | null } & Record<string, number | string | null>;

export function sumByLanguage(rows: readonly LanguageRow[]): GenreCountsByLanguage {
	const byLanguage: GenreCountsByLanguage = new Map();
	const all = GENRES.map(() => 0);
	for (const row of rows) {
		const counts = GENRES.map((_, i) => Number(row[`g${i}`] ?? 0));
		counts.forEach((n, i) => {
			all[i] = (all[i] ?? 0) + n;
		});
		// A null language counts toward `all` only, as langFilter never matches it.
		if (row.lang !== null) byLanguage.set(row.lang, counts);
	}
	byLanguage.set("all", all);
	return byLanguage;
}

export function genreCountsFor(byLanguage: GenreCountsByLanguage, lang: string): GenreCount[] {
	const counts = byLanguage.get(lang);
	return GENRES.map((g, i) => ({ id: g.id, label: g.label, count: counts?.[i] ?? 0 }));
}

/**
 * One scan for every language. Subjects are joined and lowercased once per row and
 * matched with LIKE: an ILIKE per subject per genre took seconds on the full catalog.
 * The unit separator never occurs in a pattern, so no match spans two subjects.
 */
async function loadGenreCounts(): Promise<GenreCountsByLanguage> {
	const columns = GENRES.map(
		(g, i) =>
			sql`count(*) FILTER (WHERE subjects_text LIKE ANY(${genrePatternsSql(g)}))::int AS ${sql.identifier(`g${i}`)}`,
	);
	const { rows } = await db.execute<LanguageRow>(sql`
		SELECT lang, ${sql.join(columns, sql`, `)}
		FROM (
			SELECT split_part(language, '-', 1) AS lang,
				lower(array_to_string(subjects, chr(31))) AS subjects_text
			FROM catalog_books
			WHERE suppressed = false
		) books
		GROUP BY lang
	`);
	return sumByLanguage(rows);
}

/**
 * Every language's counts from memory. Once loaded they are never awaited again: an
 * expired or refreshed value keeps being served until its replacement has loaded.
 */
export function genreCountsCache(
	load: () => Promise<GenreCountsByLanguage> = loadGenreCounts,
	ttlMs = GENRE_COUNTS_TTL_MS,
) {
	let current: { at: number; value: GenreCountsByLanguage } | null = null;
	let pending: Promise<GenreCountsByLanguage> | null = null;

	/** `afterChange`: a load already running may have read the rows before the change, so wait it out and load again. */
	function refresh(afterChange = false): Promise<GenreCountsByLanguage> {
		if (pending && afterChange)
			return pending.then(
				() => refresh(),
				() => refresh(),
			);
		if (pending) return pending;
		const next = load()
			.then((value) => {
				current = { at: Date.now(), value };
				return value;
			})
			.finally(() => {
				pending = null;
			});
		pending = next;
		return next;
	}

	return {
		async get(lang: string): Promise<GenreCount[]> {
			if (!current) return genreCountsFor(await refresh(), lang);
			if (Date.now() - current.at >= ttlMs) refresh().catch(reportFailure);
			return genreCountsFor(current.value, lang);
		},
		refresh,
	};
}

export const genreCounts = genreCountsCache();

function reportFailure(err: unknown) {
	console.error("[catalog] genre counts failed:", err);
	captureException(err, { tags: { kind: "genre-counts" } });
}

/** For startup and after a sync: never rejects, a failed load keeps the old counts. */
export function warmGenreCounts(afterChange = false): Promise<void> {
	return genreCounts.refresh(afterChange).then(() => undefined, reportFailure);
}
