export const BOOKS_DRAG_TYPE = "application/x-lesefluss-books";
export const COLLECTION_DRAG_TYPE = "application/x-lesefluss-collection";

export function setBooksDragData(dataTransfer: DataTransfer, bookIds: string[]): void {
	dataTransfer.setData(BOOKS_DRAG_TYPE, JSON.stringify(bookIds));
	dataTransfer.effectAllowed = "copy";
}

/** Only `types` is readable during dragover; the payload itself only on drop. */
export function carries(dataTransfer: DataTransfer, type: string): boolean {
	return Array.from(dataTransfer.types).includes(type);
}

export function readBooksDragData(dataTransfer: DataTransfer): string[] {
	try {
		const parsed: unknown = JSON.parse(dataTransfer.getData(BOOKS_DRAG_TYPE));
		return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
	} catch {
		return [];
	}
}
