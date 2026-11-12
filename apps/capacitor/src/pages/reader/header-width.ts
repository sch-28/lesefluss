const NARROW_HEADER_REM = 22;
/** Back, Aa, RSVP and ⋮ plus a title of a few words; below it the title has no readable room. */
const TITLE_HEADER_REM = 18;
/** Room the series Previous and Next chapter buttons take from the title. */
const SERIES_NAV_REM = 5;

type HeaderSize = { widthPx: number; remPx: number; hasSeriesNav: boolean };

function isBelow(limitRem: number, { widthPx, remPx, hasSeriesNav }: HeaderSize): boolean {
	const limit = limitRem + (hasSeriesNav ? SERIES_NAV_REM : 0);
	return widthPx > 0 && widthPx < limit * remPx;
}

/** Below this width the header folds Listen and Bookmark into ⋮ so the title stays readable. */
export function isReaderHeaderNarrow(size: HeaderSize): boolean {
	return isBelow(NARROW_HEADER_REM, size);
}

/** Below this width, even with Listen and Bookmark folded, the title shows to screen readers only. */
export function isReaderTitleHidden(size: HeaderSize): boolean {
	return isBelow(TITLE_HEADER_REM, size);
}
