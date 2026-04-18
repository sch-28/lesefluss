import type React from "react";
import { useState } from "react";

type Props = {
	src: string | null | undefined;
	alt: string;
	/** Shown while loading and on decode error. Defaults to a generic "BOOK" stub. */
	fallback?: React.ReactNode;
	/** Add to the outer wrapper. The wrapper fills its parent (needs sized parent). */
	className?: string;
	/** Prioritise the first paint of this image. Skips lazy-loading and hints the
	 * browser's fetch scheduler that this is high-priority (hero, above-the-fold). */
	priority?: boolean;
	imgClassName?: string;
};

/**
 * Cover image wrapper with three-state rendering (loading / loaded / error) and
 * off-main-thread decoding. Reserves space via the parent's aspect-ratio, so
 * the layout doesn't shift when the image resolves.
 *
 * The shimmer placeholder keeps the skeleton visible *under* the image until
 * the `load` event fires — the image itself starts transparent and fades in.
 */
const CoverImage: React.FC<Props> = ({
	src,
	alt,
	fallback,
	className,
	priority,
	imgClassName,
}) => {
	const [state, setState] = useState<"loading" | "loaded" | "error">("loading");

	const showImage = !!src && state !== "error";
	const showFallback = !src || state === "error";
	const placeholder = fallback ?? (
		<span className="font-semibold text-[#bbb] text-[0.6rem] tracking-wide">BOOK</span>
	);

	return (
		<div className={`cover-image ${className ?? ""}`.trim()}>
			{/* Skeleton shimmer — stays visible under the image until load fires. */}
			{showImage && state === "loading" && <div className="cover-image-shimmer" />}

			{/* Fallback (no src OR load error). */}
			{showFallback && (
				<div className="cover-image-fallback">{placeholder}</div>
			)}

			{/* Image itself — transparent until loaded, then fades in. */}
			{showImage && (
				<img
					src={src}
					alt={alt}
					decoding="async"
					loading={priority ? "eager" : "lazy"}
					// fetchpriority is a standard HTML attribute but React's types
					// lag behind. Cast is localised and documented.
					{...({ fetchpriority: priority ? "high" : "auto" } as {
						fetchpriority: "high" | "auto";
					})}
					onLoad={() => setState("loaded")}
					onError={() => setState("error")}
					className={`${imgClassName ?? "block h-full w-full object-cover"} cover-image-img ${
						state === "loaded" ? "is-loaded" : ""
					}`}
				/>
			)}
		</div>
	);
};

export default CoverImage;
