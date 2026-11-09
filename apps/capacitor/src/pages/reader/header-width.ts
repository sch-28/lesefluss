const NARROW_HEADER_REM = 22;
/** Room the series Previous and Next chapter buttons take from the title. */
const SERIES_NAV_REM = 5;

/** Below this width the header folds Listen and Bookmark into ⋮ so the title stays readable. */
export function isReaderHeaderNarrow({
	widthPx,
	remPx,
	hasSeriesNav,
}: {
	widthPx: number;
	remPx: number;
	hasSeriesNav: boolean;
}): boolean {
	const limitRem = NARROW_HEADER_REM + (hasSeriesNav ? SERIES_NAV_REM : 0);
	return widthPx > 0 && widthPx < limitRem * remPx;
}
