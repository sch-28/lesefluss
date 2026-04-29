import type React from "react";
import { useState } from "react";
import { proxyImageUrl } from "../services/catalog/client";

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
const CoverImage: React.FC<Props> = ({ src, alt, fallback, className, priority, imgClassName }) => {
	const [state, setState] = useState<"loading" | "loaded" | "error">("loading");

	// On web, the strict CSP allows `img-src` only for self / data: / blob: / catalog
	// origin, so cross-origin upstream covers (e.g. royalroadcdn.com) need to be
	// routed through the catalog `/proxy/image` endpoint. On native this returns
	// the URL unchanged.
	const resolvedSrc = proxyImageUrl(src);
	const showImage = !!resolvedSrc && state !== "error";
	const showFallback = !resolvedSrc || state === "error";
	const placeholder = fallback ?? (
		<span className="font-semibold text-[#bbb] text-[0.6rem] tracking-wide">BOOK</span>
	);

	return (
		<div className={`cover-image ${className ?? ""}`.trim()}>
			{/* Fallback (no src OR load error). */}
			{showFallback && <div className="cover-image-fallback">{placeholder}</div>}

			{/* Image itself — rendered at full opacity; shimmer fades out on top. */}
			{showImage && (
				<img
					src={resolvedSrc ?? undefined}
					alt={alt}
					decoding="async"
					loading={priority ? "eager" : "lazy"}
					{...({ fetchpriority: priority ? "high" : "auto" } as {
						fetchpriority: "high" | "auto";
					})}
					onLoad={() => setState("loaded")}
					onError={() => setState("error")}
					className={imgClassName ?? "block h-full w-full object-cover"}
				/>
			)}

			{/* Skeleton shimmer — sits on top of the image and fades out once loaded.
			    This prevents the container background from flashing through. */}
			{showImage && (
				<div
					className={`cover-image-shimmer${state === "loaded" ? "cover-image-shimmer--done" : ""}`}
				/>
			)}
		</div>
	);
};

export default CoverImage;
