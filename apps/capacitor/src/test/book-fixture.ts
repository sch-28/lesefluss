import { wordPos } from "@lesefluss/core";
import type { Book } from "../services/db/schema";

export function makeBook(overrides: Partial<Book> = {}): Book {
	return {
		id: "deadbeef",
		title: "T",
		author: null,
		fileFormat: "txt",
		filePath: null,
		size: 0,
		wordPosition: wordPos(0),
		wordCount: 1000,
		isActive: false,
		addedAt: 0,
		updatedAt: 0,
		metadataUpdatedAt: 0,
		lastRead: null,
		finishedAt: null,
		description: null,
		language: null,
		status: null,
		rating: null,
		review: null,
		tags: null,
		hideFromProfile: false,
		originKey: null,
		source: null,
		catalogId: null,
		sourceUrl: null,
		deleted: false,
		seriesId: null,
		chapterIndex: null,
		chapterSourceUrl: null,
		chapterStatus: "fetched",
		chapterError: null,
		...overrides,
	};
}
