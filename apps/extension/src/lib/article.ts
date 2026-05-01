import { apiUrl } from "./config";
import {
	type ArticleLookupResponse,
	type PageCapturePayload,
	type SaveArticleResponse,
	UnauthorizedError,
} from "./messages";

function hasId(value: unknown): value is { id: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { id?: unknown }).id === "string"
	);
}

async function readErrorBody(response: Response): Promise<string | null> {
	try {
		const body: unknown = await response.json();
		if (typeof body === "object" && body !== null) {
			const err = (body as { error?: unknown }).error;
			if (typeof err === "string" && err.length > 0) return err;
		}
	} catch {
		// Non-JSON body, fall through to the generic status-code message.
	}
	return null;
}

function hasLookupBook(value: unknown): value is { book: SaveArticleResponse | null } {
	if (typeof value !== "object" || value === null || !("book" in value)) return false;
	const book = (value as { book?: unknown }).book;
	return (
		book === null ||
		(typeof book === "object" &&
			book !== null &&
			typeof (book as SaveArticleResponse).id === "string" &&
			typeof (book as SaveArticleResponse).title === "string" &&
			typeof (book as SaveArticleResponse).url === "string")
	);
}

export async function lookupArticleByUrl(
	token: string,
	url: string,
): Promise<ArticleLookupResponse> {
	const response = await fetch(apiUrl(`/api/import/article?url=${encodeURIComponent(url)}`), {
		headers: { Authorization: `Bearer ${token}` },
	});

	if (response.status === 401) throw new UnauthorizedError();
	if (!response.ok) return null;

	const data: unknown = await response.json();
	if (!hasLookupBook(data)) return null;
	return data.book;
}

export async function importArticle(
	token: string,
	payload: PageCapturePayload,
): Promise<SaveArticleResponse> {
	const response = await fetch(apiUrl("/api/import/article"), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (response.status === 401) throw new UnauthorizedError();
	if (!response.ok) {
		const detail = await readErrorBody(response);
		throw new Error(detail ?? `Import failed (${response.status})`);
	}

	const data: unknown = await response.json();
	if (!hasId(data)) throw new Error("Import response did not include a book id.");
	return { id: data.id, title: payload.title, url: payload.url };
}
