/**
 * Shared imperative interface that scroll-view and page-view both expose
 * via forwardRef + useImperativeHandle. Lets the parent reader trigger
 * jumps from chapter / search / highlight-list interactions without
 * caring which view is mounted.
 */
export interface ReaderViewHandle {
	jumpTo(byteOffset: number, opts?: { highlight?: boolean }): void;
}
