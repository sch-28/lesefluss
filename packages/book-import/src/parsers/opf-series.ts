export type OpfSeries = { seriesName: string | null; seriesIndex: number | null };

/** Longest series name kept; the sync schema caps the field at this length. */
export const SERIES_NAME_MAX = 200;

/** Highest series number kept; the sync schema caps the field at this value. */
export const SERIES_INDEX_MAX = 100_000;

const NO_SERIES: OpfSeries = { seriesName: null, seriesIndex: null };

/**
 * The book-level series an OPF package document declares. Calibre's
 * `calibre:series` / `calibre:series_index` meta wins; otherwise the first
 * EPUB 3 `belongs-to-collection` typed `series` (or untyped; a `set` is not a
 * series), with its `group-position` refinement as the number.
 *
 * Pure over the OPF text so a later pass over stored EPUBs can reuse it.
 */
export function readOpfSeries(opfXml: string): OpfSeries {
	const doc = new DOMParser().parseFromString(opfXml, "application/xml");
	if (doc.getElementsByTagName("parsererror").length > 0) return NO_SERIES;
	// By qualified name: some EPUB 2 packages prefix the OPF namespace.
	const metas = [
		...Array.from(doc.getElementsByTagName("meta")),
		...Array.from(doc.getElementsByTagName("opf:meta")),
	];

	const calibreName = seriesName(metaContent(metas, "calibre:series"));
	if (calibreName) {
		return {
			seriesName: calibreName,
			seriesIndex: seriesIndex(metaContent(metas, "calibre:series_index")),
		};
	}

	const refinement = (id: string, property: string) =>
		metas
			.find(
				(m) => m.getAttribute("refines") === `#${id}` && m.getAttribute("property") === property,
			)
			?.textContent?.trim() ?? null;
	const collections = metas
		.filter((m) => m.getAttribute("property") === "belongs-to-collection")
		.map((m) => {
			const id = m.getAttribute("id");
			return {
				name: seriesName(m.textContent),
				type: id ? refinement(id, "collection-type") : null,
				position: id ? refinement(id, "group-position") : null,
			};
		})
		.filter((c) => c.name && (c.type === null || c.type === "series"));
	const collection = collections.find((c) => c.type === "series") ?? collections[0];
	if (!collection?.name) return NO_SERIES;
	return { seriesName: collection.name, seriesIndex: seriesIndex(collection.position) };
}

function metaContent(metas: Element[], name: string): string | null {
	return metas.find((m) => m.getAttribute("name") === name)?.getAttribute("content") ?? null;
}

function seriesName(raw: string | null | undefined): string | null {
	const name = raw?.replace(/\s+/g, " ").trim().slice(0, SERIES_NAME_MAX).trim();
	return name || null;
}

/** A series number as written: decimals allowed ("2.5"), anything else is no number. */
export function seriesIndex(raw: string | null | undefined): number | null {
	const text = raw?.trim();
	if (!text || !/^\d+(\.\d+)?$/.test(text)) return null;
	const value = Number(text);
	return Number.isFinite(value) && value <= SERIES_INDEX_MAX ? value : null;
}
