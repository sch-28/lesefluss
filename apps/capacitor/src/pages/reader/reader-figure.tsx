import type React from "react";
import { memo } from "react";
import { queryHooks } from "../../services/db/hooks";
import type { ReaderFigureData } from "./reader-figures";

const preventDragStart = (e: React.DragEvent<HTMLImageElement>) => e.preventDefault();
const UNSIZED_ASPECT_RATIO = "4 / 3";

/**
 * One body image. The `width`/`height` attributes reserve the aspect box
 * before the bytes arrive, so neither virtua's height reconciliation nor the
 * page-mode column flow shifts when the image decodes. Nothing is rendered
 * once the store says the bytes are not on this device.
 */
const ReaderFigure: React.FC<{ figure: ReaderFigureData }> = memo(({ figure }) => {
	const { bookId, key, alt, width, height, isLineArt } = figure;
	const { data: src } = queryHooks.useBookImageData(bookId, key);
	const hasSize = width > 0 && height > 0;
	// The figure reserves its box on its own, so the bytes can arrive whenever
	// they like without moving the text or the page count. An image whose size
	// could not be read at import gets a fixed landscape box and is letterboxed
	// into it. The img only mounts once the bytes are known, or Chrome paints
	// the alt text into the box meanwhile.
	const style: React.CSSProperties = hasSize
		? { aspectRatio: `${width} / ${height}`, maxWidth: `min(100%, ${width}px)` }
		: { aspectRatio: UNSIZED_ASPECT_RATIO };
	if (src === null) return null;
	const classes = ["reader-figure"];
	if (isLineArt) classes.push("reader-figure--line-art");
	return (
		<figure className={classes.join(" ")} style={style}>
			{src !== undefined && (
				<img
					src={src}
					alt={alt}
					width={hasSize ? width : undefined}
					height={hasSize ? height : undefined}
					decoding="async"
					draggable={false}
					onDragStart={preventDragStart}
				/>
			)}
		</figure>
	);
});

export default ReaderFigure;

export function renderFigures(figures: readonly ReaderFigureData[] | undefined): React.ReactNode {
	if (!figures?.length) return null;
	// Prefixed: trailing figures sit beside `<Paragraph key={i}>` in the same
	// virtualised list, and virtua keys its items by the element key.
	return figures.map((f) => <ReaderFigure key={`figure-${f.id}`} figure={f} />);
}
