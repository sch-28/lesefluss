/**
 * Shared imperative interface that scroll-view and page-view both expose
 * via forwardRef + useImperativeHandle. Lets the parent reader trigger
 * jumps from chapter / search / highlight-list interactions without
 * caring which view is mounted.
 */
export interface ReaderViewHandle {
	// `fine: true` skips the coarse paragraph-level scrollToIndex and runs
	// only the precise word-level scroll. Use for small, on-screen nudges
	// (e.g. live device→app position notify) where the coarse step would
	// produce a visible double-jump.
	// `smooth: true` animates the fine scroll over ~250ms instead of jumping
	// instantly. Only meaningful in combination with `fine` (the coarse step
	// is always instant). Use for live BLE updates so the highlight glides
	// rather than snapping.
	jumpTo(
		byteOffset: number,
		opts?: { highlight?: boolean; fine?: boolean; smooth?: boolean },
	): void;
	scrollBy?(pixels: number): void;
	goNext?(): void;
	goPrev?(): void;
}
