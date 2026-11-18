import type React from "react";
import { useState } from "react";
import { proxyImageUrl } from "../services/catalog/client";
import { useReconnectEpoch } from "../utils/reconnect";
import { TintedCover } from "./tinted-cover";

const preventDragStart = (e: React.DragEvent<HTMLImageElement>) => e.preventDefault();

type Props = {
	src: string | null | undefined;
	alt: string;
	/** Shown while loading and on decode error. Defaults to a TintedCover of `alt`, or a "BOOK" stub when `alt` is empty. */
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
	// A cover that failed while offline gets another try once the device is back
	// online; the epoch also keys the <img> so the browser really refetches.
	const reconnectEpoch = useReconnectEpoch();
	const [failedAtEpoch, setFailedAtEpoch] = useState<number | null>(null);
	if (state === "error" && failedAtEpoch !== null && failedAtEpoch !== reconnectEpoch) {
		setFailedAtEpoch(null);
		setState("loading");
	}

	// On web, the strict CSP allows `img-src` only for self / data: / blob: / catalog
	// origin, so cross-origin upstream covers (e.g. royalroadcdn.com) need to be
	// routed through the catalog `/proxy/image` endpoint. On native this returns
	// the URL unchanged.
	const resolvedSrc = proxyImageUrl(src);
	const showImage = !!resolvedSrc && state !== "error";
	const showFallback = !resolvedSrc || state === "error";
	const placeholder =
		fallback ??
		(alt ? (
			<TintedCover title={alt} />
		) : (
			// ui-rules-allow: raw-colour -- sits on the cover's own fixed placeholder fill, not a theme surface
			<span className="font-semibold text-2xs text-[#bbb] tracking-wide">BOOK</span>
		));

	return (
		<div className={`cover-image ${className ?? ""}`.trim()}>
			{/* Fallback (no src OR load error). */}
			{showFallback && <div className="cover-image-fallback">{placeholder}</div>}

			{/* Image itself — rendered at full opacity; shimmer fades out on top. */}
			{showImage && (
				<img
					key={reconnectEpoch}
					src={resolvedSrc ?? undefined}
					alt={alt}
					decoding="async"
					loading={priority ? "eager" : "lazy"}
					draggable={false}
					onDragStart={preventDragStart}
					fetchPriority={priority ? "high" : "auto"}
					onLoad={() => setState("loaded")}
					onError={() => {
						setFailedAtEpoch(reconnectEpoch);
						setState("error");
					}}
					className={imgClassName ?? "block h-full w-full object-cover"}
				/>
			)}

			{/* Skeleton shimmer — sits on top of the image and fades out once loaded.
			    This prevents the container background from flashing through. */}
			{showImage && (
				<div
					className={
						state === "loaded"
							? "cover-image-shimmer cover-image-shimmer--done"
							: "cover-image-shimmer"
					}
				/>
			)}
		</div>
	);
};

export default CoverImage;
