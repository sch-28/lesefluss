import type { Page, Route } from "@playwright/test";

const CATALOG = "https://catalog.lesefluss.app";

type Entry = { id: string; title: string; author: string; words: number; subjects: string[] };

const BOOKS: Entry[] = [
	{
		id: "gutenberg:1342",
		title: "Pride and Prejudice",
		author: "Jane Austen",
		words: 121_000,
		subjects: ["Romance"],
	},
	{
		id: "gutenberg:84",
		title: "Frankenstein",
		author: "Mary Shelley",
		words: 75_000,
		subjects: ["Horror", "Science fiction"],
	},
	{
		id: "gutenberg:345",
		title: "Dracula",
		author: "Bram Stoker",
		words: 160_000,
		subjects: ["Horror"],
	},
	{
		id: "gutenberg:35",
		title: "The Time Machine",
		author: "H. G. Wells",
		words: 32_000,
		subjects: ["Science fiction"],
	},
	{
		id: "gutenberg:2701",
		title: "Moby Dick",
		author: "Herman Melville",
		words: 210_000,
		subjects: ["Adventure"],
	},
	{
		id: "gutenberg:1661",
		title: "The Adventures of Sherlock Holmes",
		author: "Arthur Conan Doyle",
		words: 105_000,
		subjects: ["Mystery"],
	},
	{
		id: "gutenberg:11",
		title: "Alice's Adventures in Wonderland",
		author: "Lewis Carroll",
		words: 27_000,
		subjects: ["Fantasy"],
	},
	{
		id: "gutenberg:98",
		title: "A Tale of Two Cities",
		author: "Charles Dickens",
		words: 136_000,
		subjects: ["Historical fiction"],
	},
	{
		id: "se:jane-austen/emma",
		title: "Emma",
		author: "Jane Austen",
		words: 160_000,
		subjects: ["Romance"],
	},
	{
		id: "se:h-g-wells/the-war-of-the-worlds",
		title: "The War of the Worlds",
		author: "H. G. Wells",
		words: 60_000,
		subjects: ["Science fiction"],
	},
	{
		id: "se:anthony-trollope/the-warden",
		title: "The Warden",
		author: "Anthony Trollope",
		words: 72_000,
		subjects: ["Fiction"],
	},
	{
		id: "se:jules-verne/around-the-world-in-eighty-days",
		title: "Around the World in Eighty Days",
		author: "Jules Verne",
		words: 63_000,
		subjects: ["Adventure"],
	},
];

const SUMMARY =
	"A classic of its age, reissued from the public domain and set for comfortable reading on any screen.";

const TAGS = [
	{ id: "science-fiction", label: "Science fiction", count: 412 },
	{ id: "romance", label: "Romance", count: 380 },
	{ id: "horror", label: "Horror", count: 154 },
	{ id: "adventure", label: "Adventure", count: 296 },
	{ id: "mystery", label: "Mystery", count: 233 },
];

function result(book: Entry) {
	return {
		id: book.id,
		source: book.id.startsWith("se:") ? "standard_ebooks" : "gutenberg",
		title: book.title,
		author: book.author,
		language: "en",
		subjects: book.subjects,
		summary: SUMMARY,
		coverUrl: null,
		hasEpub: true,
		wordCount: book.words,
		wordCountEstimated: false,
	};
}

const results = (from: number, count: number) =>
	Array.from({ length: count }, (_, i) => result(BOOKS[(from + i) % BOOKS.length] as Entry));

function body(path: string, query: URLSearchParams): unknown | null {
	const lang = query.get("lang") ?? "en";
	if (path === "/landing")
		return {
			lang,
			featured_se: results(8, 4),
			classics: results(0, 8),
			most_read: results(3, 8),
			recently_added: results(5, 8),
			genres: TAGS.slice(0, 3).map((tag, i) => ({
				id: tag.id,
				label: tag.label,
				books: results(i * 2, 6),
			})),
		};
	if (path === "/genres")
		return { lang, genres: TAGS.map(({ id, label, count }) => ({ id, label, count })) };
	if (path === "/languages")
		return {
			total: 3,
			languages: [
				{ code: "en", count: 52_000 },
				{ code: "de", count: 2_100 },
				{ code: "fr", count: 3_400 },
			],
		};
	if (path === "/tags") return { lang, total: TAGS.length, tags: TAGS };
	if (path === "/shelves/random")
		return { lang, source: "any", count: 8, results: results(2, Number(query.get("count") ?? 8)) };
	if (path === "/search") {
		const q = query.get("q") ?? "";
		const hits = BOOKS.filter(
			(b) => !q || `${b.title} ${b.author}`.toLowerCase().includes(q.toLowerCase()),
		);
		return {
			q,
			lang,
			genre: query.get("genre"),
			tags: [],
			sort: query.get("sort") ?? "relevance",
			page: 1,
			limit: 20,
			total: hits.length,
			results: hits.map(result),
			facets: { tags: TAGS },
			suggestion: null,
		};
	}
	if (path.startsWith("/books/similar/")) return { results: results(4, 6) };
	if (path.startsWith("/books/") && !path.startsWith("/books/epub/")) {
		const id = decodeURIComponent(path.slice("/books/".length));
		const book = BOOKS.find((b) => b.id === id) ?? (BOOKS[0] as Entry);
		return {
			...result(book),
			description: `${SUMMARY} ${book.title} by ${book.author} is one of the most read books in the catalog.`,
			epubUrl: `${CATALOG}/books/epub/${encodeURIComponent(book.id)}`,
			tags: book.subjects.map((label) => ({ id: label.toLowerCase().replace(/ /g, "-"), label })),
			authorBirthYear: null,
			authorDeathYear: null,
		};
	}
	return null;
}

/** Answers the catalog from fixed data; covers and images 404, so both refs draw the fallback cover. */
export async function stubCatalog(page: Page): Promise<void> {
	await page.route(`${CATALOG}/**`, (route: Route) => {
		const url = new URL(route.request().url());
		const json = body(url.pathname, url.searchParams);
		return json === null
			? route.fulfill({ status: 404, body: "" })
			: route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json) });
	});
}

export const STUB_CATALOG_ID = "gutenberg:84";
