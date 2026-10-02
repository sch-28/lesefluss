export type ImageDimensions = { width: number; height: number };

/**
 * Read intrinsic pixel size from the file header without decoding the image.
 * Covers PNG, JPEG, GIF, WebP and SVG (width/height or viewBox). Null when the
 * format is unknown or the header is truncated.
 */
export function sniffImageDimensions(bytes: Uint8Array): ImageDimensions | null {
	return (
		sniffPng(bytes) ?? sniffGif(bytes) ?? sniffJpeg(bytes) ?? sniffWebp(bytes) ?? sniffSvg(bytes)
	);
}

function u16be(b: Uint8Array, i: number): number {
	return (b[i] << 8) | b[i + 1];
}
function u16le(b: Uint8Array, i: number): number {
	return b[i] | (b[i + 1] << 8);
}
function u24le(b: Uint8Array, i: number): number {
	return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
}
function u32be(b: Uint8Array, i: number): number {
	return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}
function ascii(b: Uint8Array, start: number, len: number): string {
	let s = "";
	for (let i = start; i < start + len && i < b.length; i++) s += String.fromCharCode(b[i]);
	return s;
}

function sniffPng(b: Uint8Array): ImageDimensions | null {
	if (b.length < 24 || ascii(b, 1, 3) !== "PNG" || b[0] !== 0x89) return null;
	if (ascii(b, 12, 4) !== "IHDR") return null;
	return { width: u32be(b, 16), height: u32be(b, 20) };
}

function sniffGif(b: Uint8Array): ImageDimensions | null {
	if (b.length < 10 || ascii(b, 0, 3) !== "GIF") return null;
	return { width: u16le(b, 6), height: u16le(b, 8) };
}

/** Walk JPEG segments to the first start-of-frame marker. */
function sniffJpeg(b: Uint8Array): ImageDimensions | null {
	if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
	let i = 2;
	while (i + 9 < b.length) {
		if (b[i] !== 0xff) {
			i++;
			continue;
		}
		const marker = b[i + 1];
		if (marker === 0xff) {
			i++;
			continue;
		}
		// Standalone markers carry no length.
		if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			i += 2;
			continue;
		}
		const len = u16be(b, i + 2);
		const isSof =
			marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
		if (isSof) {
			return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
		}
		if (marker === 0xd9 || marker === 0xda) return null;
		i += 2 + len;
	}
	return null;
}

function sniffWebp(b: Uint8Array): ImageDimensions | null {
	if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
	const chunk = ascii(b, 12, 4);
	if (chunk === "VP8X") {
		return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
	}
	if (chunk === "VP8L") {
		const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
		return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
	}
	if (chunk === "VP8 ") {
		// Lossy bitstream: 3-byte frame tag, 3-byte start code, then 14-bit dims.
		return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
	}
	return null;
}

const SVG_HEAD_BYTES = 4096;

function svgLength(value: string | undefined): number | null {
	if (!value) return null;
	const m = value.trim().match(/^([0-9.]+)(px)?$/);
	if (!m) return null;
	const n = Number.parseFloat(m[1]);
	return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function sniffSvg(b: Uint8Array): ImageDimensions | null {
	const head = new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(0, SVG_HEAD_BYTES));
	const open = head.match(/<svg\b[^>]*>/i);
	if (!open) return null;
	const attr = (name: string) =>
		open[0].match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
	const width = svgLength(attr("width"));
	const height = svgLength(attr("height"));
	if (width && height) return { width, height };
	const viewBox = attr("viewBox")
		?.trim()
		.split(/[\s,]+/)
		.map(Number);
	if (viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
		return { width: Math.round(viewBox[2]), height: Math.round(viewBox[3]) };
	}
	return null;
}

/** Side of the sampling grid: 64 × 64 samples is plenty to tell a drawing from a photo. */
const SAMPLE_GRID = 64;
/** Max channel spread for a pixel to count as gray. */
const GRAY_TOLERANCE = 24;
/** Share of gray samples required for "monochrome". */
const MONOCHROME_SHARE = 0.96;
/** Mean luminance (0-255) the border must reach to count as a bright page. */
const BRIGHT_BORDER_LUMA = 200;

/**
 * Decide whether RGBA pixels are a near-monochrome drawing on a bright
 * background: chapter art, maps, ornaments, line illustrations. Such images can
 * be inverted on a dark page without looking wrong; photos and colour art
 * cannot. Samples a grid rather than every pixel so a 2000 px map stays cheap.
 */
export function classifyLineArt(rgba: Uint8ClampedArray, width: number, height: number): boolean {
	if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return false;
	const stepX = Math.max(1, Math.floor(width / SAMPLE_GRID));
	const stepY = Math.max(1, Math.floor(height / SAMPLE_GRID));
	let samples = 0;
	let gray = 0;
	let borderLuma = 0;
	let borderSamples = 0;
	for (let y = 0; y < height; y += stepY) {
		for (let x = 0; x < width; x += stepX) {
			const i = (y * width + x) * 4;
			const r = rgba[i];
			const g = rgba[i + 1];
			const b = rgba[i + 2];
			const a = rgba[i + 3];
			samples++;
			// Transparent pixels read as page background: bright and neutral.
			const spread = a === 0 ? 0 : Math.max(r, g, b) - Math.min(r, g, b);
			if (spread <= GRAY_TOLERANCE) gray++;
			const onBorder = y < stepY || x < stepX || y + stepY >= height || x + stepX >= width;
			if (onBorder) {
				borderLuma += a === 0 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
				borderSamples++;
			}
		}
	}
	if (samples === 0 || borderSamples === 0) return false;
	return gray / samples >= MONOCHROME_SHARE && borderLuma / borderSamples >= BRIGHT_BORDER_LUMA;
}

/**
 * Decoded pixels the preparer is allowed to touch. The byte cap on the
 * compressed file says nothing about this: a few hundred KB of PNG can declare
 * 20000 × 20000 px, and decoding that in a WebView is an OOM kill, not an
 * exception. Images above it are stored as-is with `isLineArt = false`.
 */
export const MAX_DECODE_PIXELS = 16_000_000;
/** Longest side kept in storage. Phone screens are ~1000 px wide; full-page
 *  art shipped at 2400 px and 3 to 5 MB each costs seconds per book on the
 *  SQLite bridge and tens of MB on disk for no visible gain. */
export const MAX_STORED_SIDE = 1600;
/** Files under this are stored untouched when no downscale is needed. */
const RECOMPRESS_ABOVE_BYTES = 1024 * 1024;
const JPEG_QUALITY = 0.82;
const LOSSLESS_SOURCE_TYPES = new Set(["image/png", "image/gif"]);

export type PreparedImage = {
	blob: Blob;
	width: number;
	height: number;
	isLineArt: boolean;
};

/** Target bitmap size: fit the longest side into `MAX_STORED_SIDE`, never upscale. */
export function fitWithin(size: ImageDimensions, maxSide = MAX_STORED_SIDE): ImageDimensions {
	const longest = Math.max(size.width, size.height);
	if (longest <= maxSide) return size;
	const scale = maxSide / longest;
	return {
		width: Math.max(1, Math.round(size.width * scale)),
		height: Math.max(1, Math.round(size.height * scale)),
	};
}

/** Format to store: PNG keeps transparency from any source and line art from a
 *  lossless source; everything else is a photo and becomes JPEG. */
export function storedImageType(
	sourceType: string,
	hasAlpha: boolean,
	isLineArt: boolean,
): "image/png" | "image/jpeg" {
	if (hasAlpha) return "image/png";
	return LOSSLESS_SOURCE_TYPES.has(sourceType) && isLineArt ? "image/png" : "image/jpeg";
}

function hasTransparentPixel(rgba: Uint8ClampedArray): boolean {
	for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) return true;
	return false;
}

/**
 * Decode `blob` once, at most `MAX_STORED_SIDE` on its longest side, classify
 * it and re-encode it for storage. Any missing API (test runtimes, old
 * WebViews), oversized declaration or decode failure returns the original
 * bytes with `isLineArt = false`: preparation is an optimisation and must
 * never block an import.
 */
export async function prepareImage(
	blob: Blob,
	size: ImageDimensions | null,
): Promise<PreparedImage> {
	const original: PreparedImage = {
		blob,
		width: size?.width ?? 0,
		height: size?.height ?? 0,
		isLineArt: false,
	};
	if (!size || size.width * size.height > MAX_DECODE_PIXELS) return original;
	if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") {
		return original;
	}
	let bitmap: ImageBitmap | null = null;
	try {
		// Decoded at full size, not resized by the decoder: Chromium applies EXIF
		// orientation first and `resizeWidth/Height` after, so targets derived
		// from the header's unrotated dimensions would squash a rotated photo.
		bitmap = await createImageBitmap(blob);
		const decoded = { width: bitmap.width, height: bitmap.height };
		if (decoded.width === 0 || decoded.height === 0) return original;
		const target = fitWithin(decoded);
		const needsDownscale = target.width !== decoded.width || target.height !== decoded.height;

		const sample = new OffscreenCanvas(SAMPLE_GRID, SAMPLE_GRID).getContext("2d", {
			willReadFrequently: true,
		});
		if (!sample) return original;
		sample.drawImage(bitmap, 0, 0, SAMPLE_GRID, SAMPLE_GRID);
		const pixels = sample.getImageData(0, 0, SAMPLE_GRID, SAMPLE_GRID).data;
		const isLineArt = classifyLineArt(pixels, SAMPLE_GRID, SAMPLE_GRID);

		if (!needsDownscale && blob.size <= RECOMPRESS_ABOVE_BYTES) {
			return { blob, ...decoded, isLineArt };
		}
		const canvas = new OffscreenCanvas(target.width, target.height);
		const ctx = canvas.getContext("2d");
		if (!ctx) return { ...original, ...decoded, isLineArt };
		ctx.drawImage(bitmap, 0, 0, target.width, target.height);
		const type = storedImageType(blob.type, hasTransparentPixel(pixels), isLineArt);
		const encoded = await canvas.convertToBlob(
			type === "image/jpeg" ? { type, quality: JPEG_QUALITY } : { type },
		);
		// A re-encode that saves nothing is not worth a second generation of loss.
		if (!needsDownscale && encoded.size >= blob.size) return { blob, ...decoded, isLineArt };
		return { blob: encoded, ...target, isLineArt };
	} catch {
		return original;
	} finally {
		bitmap?.close();
	}
}
