import { arrayBufferToBase64, base64ToArrayBuffer } from "./encoding";
import {
	fitWithin,
	type ImageDimensions,
	MAX_DECODE_PIXELS,
	sniffImageDimensions,
} from "./image-analysis";

/**
 * Longest side a stored cover keeps. The largest on-screen cover is a library
 * grid tile, about 120 CSS px wide on a phone, so 400 x 600 device px covers a
 * 3x screen. Covers are stored and synced inline as data URLs, so every byte
 * beyond that is paid on each library load and sync push.
 */
export const COVER_MAX_SIDE = 600;
/** Encoded size a cover should land under. Exceeded only when even the
 *  smallest rung of the ladder below cannot reach it. */
export const COVER_BUDGET_BYTES = 30 * 1024;

const ENCODE_LADDER: ReadonlyArray<{ maxSide: number; quality: number }> = [
	{ maxSide: COVER_MAX_SIDE, quality: 0.8 },
	{ maxSide: COVER_MAX_SIDE, quality: 0.65 },
	{ maxSide: COVER_MAX_SIDE, quality: 0.5 },
	{ maxSide: 400, quality: 0.6 },
];

const ALPHA_SAMPLE = 32;

type CoverCanvas = {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	encode(type: string, quality?: number): Promise<Blob | null>;
};

type CoverSource = CanvasImageSource;

function createCoverCanvas(width: number, height: number): CoverCanvas | null {
	if (typeof OffscreenCanvas === "function") {
		const canvas = new OffscreenCanvas(width, height);
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return null;
		return { ctx, encode: (type, quality) => canvas.convertToBlob({ type, quality }) };
	}
	// Safari before 16.4 has no 2D OffscreenCanvas; the main thread still has a DOM.
	if (typeof document === "undefined") return null;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;
	return {
		ctx,
		encode: (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality)),
	};
}

function sourceHasAlpha(source: CoverSource): boolean {
	const sample = createCoverCanvas(ALPHA_SAMPLE, ALPHA_SAMPLE);
	if (!sample) return false;
	sample.ctx.drawImage(source, 0, 0, ALPHA_SAMPLE, ALPHA_SAMPLE);
	const rgba = sample.ctx.getImageData(0, 0, ALPHA_SAMPLE, ALPHA_SAMPLE).data;
	for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) return true;
	return false;
}

// Safari and older WebViews cannot encode WebP; they silently hand back PNG.
let canEncodeWebp: boolean | undefined;

/** Reset the cached WebP-encoder probe. Tests only. */
export function resetCoverEncoderProbe(): void {
	canEncodeWebp = undefined;
}

async function encodeAt(
	source: CoverSource,
	size: ImageDimensions,
	hasAlpha: boolean,
	quality: number,
): Promise<Blob | null> {
	const canvas = createCoverCanvas(size.width, size.height);
	if (!canvas) return null;
	canvas.ctx.drawImage(source, 0, 0, size.width, size.height);
	if (canEncodeWebp !== false) {
		const webp = await canvas.encode("image/webp", quality);
		if (webp) canEncodeWebp = webp.type === "image/webp";
		if (webp?.type === "image/webp") return webp;
	}
	// JPEG has no alpha channel and would turn a transparent cover black.
	if (hasAlpha) return canvas.encode("image/png");
	return canvas.encode("image/jpeg", quality);
}

/**
 * Encode a decoded cover (bitmap or rendered canvas) for storage: fit into
 * `COVER_MAX_SIDE`, WebP where the platform encodes it, else JPEG, or PNG for
 * a transparent source. Walks down a quality/size ladder until the result fits
 * `COVER_BUDGET_BYTES`, keeping the smallest attempt if none does. Null when
 * the platform has no canvas to encode with.
 */
export async function encodeCover(
	source: CoverSource,
	size: ImageDimensions,
): Promise<Blob | null> {
	if (size.width <= 0 || size.height <= 0) return null;
	const hasAlpha = sourceHasAlpha(source);
	let smallest: Blob | null = null;
	let losslessSide: number | null = null;
	for (const rung of ENCODE_LADDER) {
		// PNG ignores quality: only a smaller size can change the result.
		if (rung.maxSide === losslessSide) continue;
		const encoded = await encodeAt(source, fitWithin(size, rung.maxSide), hasAlpha, rung.quality);
		if (!encoded) return smallest;
		if (encoded.type === "image/png") losslessSide = rung.maxSide;
		if (!smallest || encoded.size < smallest.size) smallest = encoded;
		if (encoded.size <= COVER_BUDGET_BYTES) break;
	}
	return smallest;
}

const STORED_COVER_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

/**
 * Shrink a cover image for storage. A cover already in a stored format and
 * within `COVER_MAX_SIDE` is final and returned untouched, even above the byte
 * budget: the ladder could not do better on it, and every pass (probe, parse,
 * commit) would otherwise add another generation of loss. Anything the platform
 * cannot or should not decode (SVG, an unreadable header, a declared size past
 * `MAX_DECODE_PIXELS`, a broken file, a runtime without canvas such as Node or
 * the test DOM) is returned as-is: a cover is cosmetic and must never fail an
 * import.
 */
export async function normalizeCover(blob: Blob): Promise<Blob> {
	const size = sniffImageDimensions(new Uint8Array(await blob.arrayBuffer()));
	if (!size || size.width * size.height > MAX_DECODE_PIXELS) return blob;
	if (STORED_COVER_TYPES.has(blob.type) && Math.max(size.width, size.height) <= COVER_MAX_SIDE) {
		return blob;
	}
	if (typeof createImageBitmap !== "function") return blob;
	let bitmap: ImageBitmap | null = null;
	try {
		bitmap = await createImageBitmap(blob);
		const encoded = await encodeCover(bitmap, { width: bitmap.width, height: bitmap.height });
		return encoded && encoded.size < blob.size ? encoded : blob;
	} catch {
		return blob;
	} finally {
		bitmap?.close();
	}
}

const DATA_URL_RE = /^data:([^;,]+)(;base64)?,/i;

/**
 * `normalizeCover` for a stored cover value. Remote URLs (web-novel covers are
 * hotlinked from the provider) and anything that is not a base64 image data
 * URL pass through unchanged.
 */
export async function normalizeCoverDataUrl(value: string | null): Promise<string | null> {
	if (!value) return value;
	const match = DATA_URL_RE.exec(value);
	if (!match?.[2] || !match[1].toLowerCase().startsWith("image/")) return value;
	let blob: Blob;
	try {
		blob = new Blob([base64ToArrayBuffer(value.slice(match[0].length))], { type: match[1] });
	} catch {
		return value;
	}
	const normalized = await normalizeCover(blob);
	return normalized === blob ? value : coverDataUrl(normalized);
}

export async function coverDataUrl(blob: Blob): Promise<string> {
	return `data:${blob.type};base64,${arrayBufferToBase64(await blob.arrayBuffer())}`;
}
