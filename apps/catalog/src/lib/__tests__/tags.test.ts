import { describe, expect, it } from "vitest";
import { normalizeSubject, normalizeSubjects, slugify, TAG_ID_PATTERN } from "../tags.js";

const ids = (subjects: string[]) => normalizeSubjects(subjects).map((t) => t.id);

describe("normalizeSubject", () => {
	it("merges Gutenberg and SE short-story vocabularies", () => {
		expect(ids(["Short stories, English"])).toEqual(["short-stories"]);
		expect(ids(["Short stories, American"])).toEqual(["short-stories"]);
		expect(ids(["Short Fiction"])).toEqual(["short-stories"]);
		expect(ids(["Shorts"])).toEqual(["short-stories"]);
	});

	it("merges case variants into one id", () => {
		expect(ids(["Science Fiction"])).toEqual(["science-fiction"]);
		expect(ids(["Science fiction"])).toEqual(["science-fiction"]);
	});

	it("keeps the head of a subdivided heading and drops the subdivisions", () => {
		expect(ids(["England -- Social life and customs -- 19th century"])).toEqual(["england"]);
		expect(ids(["Whaling -- History"])).toEqual(["whaling"]);
	});

	it("tags a form subdivision when it names a kind of book", () => {
		expect(ids(["Orphans -- Fiction"])).toEqual(["orphans", "fiction"]);
		expect(ids(["Animals -- Juvenile fiction"])).toEqual(["animals", "childrens"]);
		expect(ids(["Poets, English -- 19th century -- Biography"])).toEqual(["poets", "biography"]);
		expect(ids(["Italy -- Description and travel"])).toEqual(["italy", "travel"]);
	});

	it("strips trailing nationality and era qualifiers", () => {
		expect(ids(["Detective and mystery stories, English"])).toEqual(["mystery"]);
		expect(ids(["Authors, American -- 19th century -- Biography"])).toEqual([
			"authors",
			"biography",
		]);
		expect(ids(["Chinese fiction -- Qing dynasty, 1644-1912"])).toEqual(["fiction"]);
	});

	it("strips a leading nationality before a form noun", () => {
		expect(ids(["English poetry -- 19th century"])).toEqual(["poetry"]);
		expect(ids(["American wit and humor"])).toEqual(["humor"]);
		expect(ids(["English essays"])).toEqual(["essays"]);
	});

	it("keeps the two world wars apart", () => {
		expect(ids(["World War, 1914-1918 -- Fiction"])).toEqual(["world-war-i", "fiction"]);
		expect(ids(["World War, 1939-1945"])).toEqual(["world-war-ii"]);
	});

	it("keeps a nationality that is the subject, not a qualifier", () => {
		expect(ids(["French Revolution"])).toEqual(["french-revolution"]);
	});

	it("drops fictitious-character headings but keeps their form subdivision", () => {
		expect(ids(["Ahab, Captain (Fictitious character) -- Fiction"])).toEqual(["fiction"]);
	});

	it("maps parenthetical drama qualifiers through the alias table", () => {
		expect(ids(["Tragedies (Drama)"])).toEqual(["tragedy"]);
		expect(ids(["Tragedies"])).toEqual(["tragedy"]);
	});

	it("maps SE genre labels", () => {
		expect(ids(["Children’s"])).toEqual(["childrens"]);
		expect(ids(["Horror tales"])).toEqual(["horror"]);
		expect(ids(["Love stories"])).toEqual(["romance"]);
		expect(ids(["Adventure stories"])).toEqual(["adventure"]);
	});

	it("labels canonical tags consistently regardless of source spelling", () => {
		expect(normalizeSubject("Detective and mystery stories")[0]?.label).toBe("Mystery & detective");
		expect(normalizeSubject("Mystery")[0]?.label).toBe("Mystery & detective");
	});

	it("labels other tags from the cleaned heading", () => {
		expect(normalizeSubject("Ghost stories")[0]).toEqual({
			id: "ghost-stories",
			label: "Ghost stories",
		});
	});
});

describe("people and places", () => {
	it("drops personal-name headings but keeps their form subdivision", () => {
		expect(ids(["Shakespeare, William, 1564-1616 -- Drama"])).toEqual(["drama"]);
		expect(ids(["Napoleon I, Emperor of the French, 1769-1821"])).toEqual([]);
		expect(ids(["Joan, of Arc, Saint, 1412-1431 -- Fiction"])).toEqual(["fiction"]);
		expect(ids(["Murdock, Charles A. (Charles Albert)"])).toEqual([]);
		expect(ids(["Alec-Tweedie, Mrs. (Ethel), -1940"])).toEqual([]);
		expect(ids(["Odysseus, King of Ithaca (Mythological character)"])).toEqual([]);
	});

	it("handles '--' without spaces and a trailing vocabulary marker", () => {
		expect(ids(["San Francisco (Calif.)--Fiction (LCSH)"])).toEqual(["fiction"]);
		expect(ids(["Orphans--Juvenile fiction"])).toEqual(["orphans", "childrens"]);
	});

	it("keeps dated events that are not people", () => {
		expect(ids(["Napoleonic Wars, 1800-1815 -- Campaigns"])).toEqual(["napoleonic-wars"]);
	});

	it("drops cities and regions, keeps countries", () => {
		expect(ids(["London (England) -- Fiction"])).toEqual(["fiction"]);
		expect(ids(["San Francisco (Calif.)"])).toEqual([]);
		expect(ids(["Cornwall (England : County)"])).toEqual([]);
		expect(ids(["New York (State)"])).toEqual([]);
		expect(ids(["Africa, Central"])).toEqual([]);
		expect(ids(["Adelphi (London, England)"])).toEqual([]);
		expect(ids(["Aleppo (Syria)"])).toEqual([]);
		expect(ids(["England -- Fiction"])).toEqual(["england", "fiction"]);
	});

	it("keeps topical headings that happen to have a qualifier", () => {
		expect(ids(["Triangles (Interpersonal relations)"])).toEqual([
			"triangles-interpersonal-relations",
		]);
		expect(ids(["Mars (Planet) -- Fiction"])).toEqual(["mars-planet", "fiction"]);
		expect(ids(["Mythology, Celtic"])).toEqual(["mythology-celtic"]);
	});
});

describe("normalizeSubjects", () => {
	it("dedupes across subjects in first-seen order", () => {
		expect(
			ids([
				"Courtship -- Fiction",
				"Domestic fiction",
				"England -- Fiction",
				"Love stories",
				"Sisters -- Fiction",
			]),
		).toEqual(["courtship", "fiction", "domestic-fiction", "england", "romance", "sisters"]);
	});

	it("handles missing subjects", () => {
		expect(normalizeSubjects(null)).toEqual([]);
		expect(normalizeSubjects([])).toEqual([]);
	});

	it("only produces URL-safe ids", () => {
		const tags = normalizeSubjects([
			"Frankenstein's monster (Fictitious character) -- Fiction",
			"Paris (France) -- Fiction",
			"Œuvres d'art",
			"Science -- Periodicals",
		]);
		for (const t of tags) expect(t.id).toMatch(TAG_ID_PATTERN);
		expect(tags.map((t) => t.id)).not.toContain("paris-france");
		expect(tags.map((t) => t.id)).toContain("oeuvres-dart");
	});
});

describe("slugify", () => {
	it("strips diacritics and punctuation", () => {
		expect(slugify("Ça, c'est Noël!")).toBe("ca-cest-noel");
	});
});
