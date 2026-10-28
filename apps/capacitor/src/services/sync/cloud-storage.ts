import type { ContentQuota } from "@lesefluss/core";
import { queries } from "../db/queries";
import { getContentQuota, getQuotaBlock } from "./content-quota";

export type NotBackedUpBook = { id: string; title: string };

export type CloudStorage = { quota: ContentQuota | null; notBackedUp: NotBackedUpBook[] };

/** What settings and book detail show about the account's cloud storage. */
export async function getCloudStorage(): Promise<CloudStorage> {
	const [quota, block] = await Promise.all([getContentQuota(), getQuotaBlock()]);
	const books = await Promise.all(Object.keys(block?.books ?? {}).map((id) => queries.getBook(id)));
	return {
		quota,
		notBackedUp: books.flatMap((book) =>
			book && !book.deleted ? [{ id: book.id, title: book.title }] : [],
		),
	};
}

const listeners = new Set<(books: NotBackedUpBook[]) => void>();

/** Background pushes whose refusals name books the user has not been told about yet. */
export function onBooksNotBackedUp(listener: (books: NotBackedUpBook[]) => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function reportBooksNotBackedUp(books: NotBackedUpBook[]): void {
	if (books.length === 0) return;
	for (const listener of listeners) listener(books);
}

export function notBackedUpMessage(books: NotBackedUpBook[]): string {
	const titles = books.slice(0, 2).map((book) => `"${book.title}"`);
	const more = books.length - titles.length;
	const list = more > 0 ? `${titles.join(", ")} and ${more} more` : titles.join(" and ");
	return `Not enough cloud storage. Not backed up: ${list}.`;
}

/** After a manual sync, which reports every blocked book, not just new ones. */
export function syncedWithBlockedMessage(count: number): string {
	return `Synced. ${count} ${count === 1 ? "book isn't" : "books aren't"} backed up: not enough cloud storage.`;
}
