/**
 * Shared imperative interface that scroll-view and page-view both expose
 * via forwardRef + useImperativeHandle. Lets the parent reader trigger
 * jumps from chapter / search / highlight-list interactions without
 * caring which view is mounted.
 */
export type JumpOptions = { highlight?: boolean; fine?: boolean; smooth?: boolean };

export interface ReaderViewHandle {
	// `fine: true` skips the coarse paragraph-level scrollToIndex and runs
	// only the precise word-level scroll. Use for small, on-screen nudges
	// (e.g. live device→app position notify) where the coarse step would
	// produce a visible double-jump.
	// `smooth: true` animates the fine scroll over ~250ms instead of jumping
	// instantly (it jumps anyway while motion is reduced: the OS setting or
	// e-ink mode). Only meaningful in combination with `fine` (the coarse step
	// is always instant). Use for live BLE updates so the highlight glides
	// rather than snapping.
	jumpTo(word: number, opts?: JumpOptions): void;
	scrollBy?(pixels: number): void;
	/** Whether the reader's own input (keys, buttons, a press, an autoscroll) moved the list just now. */
	isReaderScrolling?(): boolean;
	/** Keeps a word being read aloud in view, moving only when it is about to leave it.
	 *  Returns true when it had to jump there, whose settle the caller must ignore. */
	followWord?(word: number): boolean;
	goNext?(): void;
	goPrev?(): void;
}
