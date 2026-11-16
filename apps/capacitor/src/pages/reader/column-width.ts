const COLUMN_MAX_PX = 700;
/** Text width in em that keeps a line near 65-70 characters in the reader's fonts. */
const MEASURE_EM = 32;

/** The reader's text column, margins included: never wider than 700 px or a ~68 character line. */
export function readerColumnWidthPx(fontSizePx: number, marginPx: number): number {
	return Math.min(COLUMN_MAX_PX, Math.round(fontSizePx * MEASURE_EM) + 2 * marginPx);
}
