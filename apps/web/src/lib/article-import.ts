import {
	type BookPayload,
	type DomParserFactory,
	type DomParserLike,
	fetchUrlToRawInput,
	generateBookId,
	type RawInput,
	runImportPipeline,
	utf8ByteLength,
} from "@lesefluss/book-import";
import { and, eq } from "drizzle-orm";
import { DOMParser as LinkedomDOMParser } from "linkedom";
import { z } from "zod";
import { db } from "~/db";
import { syncBooks } from "~/db/schema";
import { catalogBase } from "~/lib/catalog";
import { checkLimit } from "~/lib/rate-limit";

const MAX_DIRECT_HTML_BYTES = 5 * 1024 * 1024;

const UrlImportSchema = z
	.object({
		url: z.string().trim().min(1).max(2000),
	})
	.strict();

const HtmlImportSchema = z
	.object({
		html: z
			.string()
			.min(1)
			.refine((html) => utf8ByteLength(html) <= MAX_DIRECT_HTML_BYTES, {
				message: "HTML is too large",
			}),
		url: z.string().trim().min(1).max(2000),
		title: z.string().trim().min(1).max(500).optional(),
	})
	.strict();

const ArticleImportSchema = z.union([HtmlImportSchema, UrlImportSchema]);

type ArticleImportPayload = z.infer<typeof ArticleImportSchema>;

type ImportInput = {
	input: RawInput;
	finalUrl: string;
	titleOverride?: string;
};

type ArticleLookupBook = {
	id: string;
	title: string;
	url: string | null;
};

export type ArticleLookupDeps = {
	lookupBookByUrl?: (userId: string, url: string) => Promise<ArticleLookupBook | null>;
};

export type ArticleImportDeps = {
	fetchUrl?: typeof fetchUrlToRawInput;
	domParser?: DomParserFactory;
	generateBookId?: typeof generateBookId;
	insertBook?: (row: typeof syncBooks.$inferInsert) => Promise<boolean>;
	checkLimit?: typeof checkLimit;
	catalogUrl?: string;
};

export async function handleArticleLookupRequest(
	request: Request,
	userId: string,
	deps: ArticleLookupDeps = {},
): Promise<Response> {
	const url = new URL(request.url).searchParams.get("url");
	if (!url) return Response.json({ error: "Missing URL" }, { status: 400 });

	let normalized: string;
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("INVALID_URL");
		normalized = parsed.toString();
	} catch {
		return Response.json({ error: "Invalid URL" }, { status: 400 });
	}

	const lookup = deps.lookupBookByUrl ?? lookupSyncBookByUrl;
	return Response.json({ book: await lookup(userId, normalized) });
}

async function lookupSyncBookByUrl(userId: string, url: string): Promise<ArticleLookupBook | null> {
	const [book] = await db
		.select({
			id: syncBooks.bookId,
			title: syncBooks.title,
			url: syncBooks.sourceUrl,
		})
		.from(syncBooks)
		.where(
			and(
				eq(syncBooks.userId, userId),
				eq(syncBooks.source, "url"),
				eq(syncBooks.sourceUrl, url),
				eq(syncBooks.deleted, false),
			),
		)
		.limit(1);

	return book ?? null;
}

export async function handleArticleImportRequest(
	request: Request,
	userId: string,
	deps: ArticleImportDeps = {},
): Promise<Response> {
	const limited = enforceImportRateLimit(userId, deps.checkLimit ?? checkLimit);
	if (limited) return limited;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = ArticleImportSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid payload", issues: parsed.error.issues },
			{ status: 400 },
		);
	}

	let importInput: ImportInput;
	try {
		importInput = await resolveImportInput(parsed.data, deps);
	} catch (err) {
		return importErrorResponse(err);
	}

	let payload: BookPayload;
	try {
		payload = await runImportPipeline(importInput.input, {
			domParser: deps.domParser ?? createLinkedomParser,
		});
	} catch (err) {
		console.warn("[article-import] parse failed:", err);
		return Response.json({ error: "Import failed" }, { status: 422 });
	}
	if (!payload.content.trim()) {
		return Response.json({ error: "Article has no readable content" }, { status: 422 });
	}

	const now = new Date();
	const genId = deps.generateBookId ?? generateBookId;
	const insert = deps.insertBook ?? insertSyncBook;
	const title = importInput.titleOverride ?? payload.title;

	// 8 hex chars = 32 bits, so collisions are rare but possible for power users.
	// On unique-violation against (user_id, book_id), retry once with a fresh id.
	let bookId = genId();
	let inserted = await insert(buildRow(bookId));
	if (!inserted) {
		bookId = genId();
		inserted = await insert(buildRow(bookId));
		if (!inserted) {
			return Response.json({ error: "Import failed" }, { status: 500 });
		}
	}

	return Response.json({ id: bookId });

	function buildRow(id: string): typeof syncBooks.$inferInsert {
		return {
			userId,
			bookId: id,
			title,
			author: payload.author ?? null,
			fileSize: utf8ByteLength(payload.content),
			wordCount: countWords(payload.content),
			position: 0,
			content: payload.content,
			coverImage: payload.coverImage ?? null,
			// HTML parser doesn't emit chapters today; defensive for future parsers.
			chapters: payload.chapters ? JSON.stringify(payload.chapters) : null,
			source: "url",
			catalogId: null,
			sourceUrl: importInput.finalUrl,
			seriesId: null,
			chapterIndex: null,
			chapterSourceUrl: null,
			chapterStatus: "fetched",
			deleted: false,
			updatedAt: now,
		};
	}
}

async function resolveImportInput(
	payload: ArticleImportPayload,
	deps: ArticleImportDeps,
): Promise<ImportInput> {
	if ("html" in payload) {
		let url: URL;
		try {
			url = new URL(payload.url);
		} catch {
			throw new Error("INVALID_URL");
		}
		if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("INVALID_URL");
		return {
			finalUrl: url.toString(),
			titleOverride: payload.title,
			input: {
				kind: "bytes",
				bytes: new TextEncoder().encode(payload.html).buffer as ArrayBuffer,
				fileName: `${safeHostname(url)}.html`,
				mimeType: "text/html",
			},
		};
	}

	return (deps.fetchUrl ?? fetchUrlToRawInput)(payload.url, {
		catalogUrl: deps.catalogUrl ?? catalogBase(),
	});
}

async function insertSyncBook(row: typeof syncBooks.$inferInsert): Promise<boolean> {
	const result = await db
		.insert(syncBooks)
		.values(row)
		.onConflictDoNothing({
			target: [syncBooks.userId, syncBooks.bookId],
		});
	return (result.rowCount ?? 0) > 0;
}

function enforceImportRateLimit(userId: string, limit: typeof checkLimit): Response | null {
	const { ok, retryAfter } = limit(`article-import:${userId}`, { max: 20, windowMs: 60_000 });
	if (ok) return null;
	return Response.json(
		{ error: "Too many requests" },
		{ status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined },
	);
}

function createLinkedomParser(): DomParserLike {
	return new LinkedomDOMParser() as unknown as DomParserLike;
}

function countWords(content: string): number {
	// The sync schema stores a nullable count but Capacitor currently does not
	// persist one locally. Use the same whitespace-token semantics readers use.
	const words = content.match(/\S+/g);
	return words?.length ?? 0;
}

function safeHostname(url: URL): string {
	return url.hostname.replace(/^www\./, "") || "article";
}

function importErrorResponse(err: unknown): Response {
	const message = err instanceof Error ? err.message : "FETCH_FAILED";
	if (message === "INVALID_URL") {
		return Response.json({ error: "Invalid URL" }, { status: 400 });
	}
	if (message === "TOO_LARGE")
		return Response.json({ error: "Article is too large" }, { status: 413 });
	return Response.json({ error: "Article fetch failed" }, { status: 502 });
}
