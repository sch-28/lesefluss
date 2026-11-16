import type { BatchPickerKind } from "../../../services/book-import";

export type BatchImportCopy = {
	menuTitle: string;
	menuSubtitle: string;
	sheetTitle: string;
	scanning: string;
	nothingFound: string;
	scanFailed: string;
};

export const BATCH_IMPORT_COPY: Record<BatchPickerKind, BatchImportCopy> = {
	folder: {
		menuTitle: "Import folder",
		menuSubtitle: "Scan for books and pick what to keep",
		sheetTitle: "Import folder",
		scanning: "Scanning folder…",
		nothingFound: "No books found in that folder",
		scanFailed: "Couldn't scan that folder",
	},
	files: {
		menuTitle: "Import multiple files",
		menuSubtitle: "Select several books and pick what to keep",
		sheetTitle: "Import files",
		scanning: "Reading files…",
		nothingFound: "None of those files is a book",
		scanFailed: "Couldn't read those files",
	},
};
