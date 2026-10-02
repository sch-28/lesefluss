import { describe, expect, it } from "vitest";
import {
	classifyLineArt,
	fitWithin,
	MAX_STORED_SIDE,
	prepareImage,
	sniffImageDimensions,
	storedImageType,
} from "../utils/image-analysis";

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
	const buf = Buffer.from(b64, "base64");
	const out = new Uint8Array(buf.length);
	out.set(buf);
	return out;
}

describe("sniffImageDimensions", () => {
	it("reads a PNG header", () => {
		const png = fromBase64(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
		);
		expect(sniffImageDimensions(png)).toEqual({ width: 1, height: 1 });
	});

	it("reads a GIF header", () => {
		const gif = fromBase64("R0lGODlhAgADAIAAAAAAAP///yH5BAEAAAAALAAAAAACAAMAAAIChF8AOw==");
		expect(sniffImageDimensions(gif)).toEqual({ width: 2, height: 3 });
	});

	it("walks JPEG segments to the SOF0 frame", () => {
		// SOI, APP0 (16 bytes), SOF0 with height 0x0100 width 0x0180, then EOI.
		const jpeg = new Uint8Array([
			0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
			0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0x00, 0x01, 0x80, 0x01,
			0x01, 0x11, 0x00, 0xff, 0xd9,
		]);
		expect(sniffImageDimensions(jpeg)).toEqual({ width: 384, height: 256 });
	});

	it("reads WebP VP8X extended headers", () => {
		const b = new Uint8Array(30);
		b.set([0x52, 0x49, 0x46, 0x46], 0);
		b.set([0x57, 0x45, 0x42, 0x50], 8);
		b.set([0x56, 0x50, 0x38, 0x58], 12);
		// canvas width - 1 = 639, height - 1 = 479 as 24-bit little endian
		b.set([0x7f, 0x02, 0x00], 24);
		b.set([0xdf, 0x01, 0x00], 27);
		expect(sniffImageDimensions(b)).toEqual({ width: 640, height: 480 });
	});

	it("reads SVG width/height, then viewBox", () => {
		const enc = new TextEncoder();
		expect(
			sniffImageDimensions(
				enc.encode('<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="80"/>'),
			),
		).toEqual({ width: 120, height: 80 });
		expect(
			sniffImageDimensions(enc.encode('<?xml version="1.0"?>\n<svg viewBox="0 0 300 150"></svg>')),
		).toEqual({ width: 300, height: 150 });
	});

	it("returns null for unknown or truncated bytes", () => {
		expect(sniffImageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
		expect(sniffImageDimensions(new TextEncoder().encode("hello world, not an image"))).toBeNull();
	});
});

function canvas(
	width: number,
	height: number,
	paint: (x: number, y: number) => [number, number, number],
) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const [r, g, b] = paint(x, y);
			const i = (y * width + x) * 4;
			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
			data[i + 3] = 255;
		}
	}
	return data;
}

describe("classifyLineArt", () => {
	it("flags a black drawing on white", () => {
		const w = 200;
		const h = 100;
		const data = canvas(w, h, (x, y) =>
			x > 40 && x < 160 && y % 7 === 0 ? [10, 10, 10] : [255, 255, 255],
		);
		expect(classifyLineArt(data, w, h)).toBe(true);
	});

	it("flags gray chapter art with anti-aliased strokes", () => {
		const w = 300;
		const h = 120;
		const data = canvas(w, h, (x, y) => {
			const d = Math.abs(y - 60) + Math.abs(x - 150) / 3;
			const v = d < 20 ? Math.round(40 + d * 8) : 250;
			return [v, v, v];
		});
		expect(classifyLineArt(data, w, h)).toBe(true);
	});

	it("rejects a colour photo", () => {
		const w = 160;
		const h = 120;
		const data = canvas(w, h, (x, y) => [(x * 3) % 256, (y * 5) % 256, 90]);
		expect(classifyLineArt(data, w, h)).toBe(false);
	});

	it("rejects a grayscale photo with dark edges", () => {
		const w = 160;
		const h = 120;
		const data = canvas(w, h, (x, y) => {
			const v = Math.round(60 + 100 * Math.sin(x / 9) * Math.cos(y / 11));
			return [v, v, v];
		});
		expect(classifyLineArt(data, w, h)).toBe(false);
	});

	it("rejects empty or short buffers", () => {
		expect(classifyLineArt(new Uint8ClampedArray(0), 0, 0)).toBe(false);
		expect(classifyLineArt(new Uint8ClampedArray(8), 4, 4)).toBe(false);
	});
});

describe("fitWithin", () => {
	it("leaves small images alone and never upscales", () => {
		expect(fitWithin({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
		expect(fitWithin({ width: MAX_STORED_SIDE, height: 10 })).toEqual({
			width: MAX_STORED_SIDE,
			height: 10,
		});
	});

	it("scales the longest side down to the cap and keeps the aspect ratio", () => {
		expect(fitWithin({ width: 1590, height: 2400 })).toEqual({ width: 1060, height: 1600 });
		expect(fitWithin({ width: 2100, height: 1585 })).toEqual({ width: 1600, height: 1208 });
	});
});

describe("storedImageType", () => {
	it("keeps lossless sources lossless only for transparency or line art", () => {
		expect(storedImageType("image/png", true, false)).toBe("image/png");
		expect(storedImageType("image/png", false, true)).toBe("image/png");
		expect(storedImageType("image/gif", false, true)).toBe("image/png");
		expect(storedImageType("image/png", false, false)).toBe("image/jpeg");
	});

	it("keeps transparency from any source and turns opaque photos into JPEG", () => {
		expect(storedImageType("image/jpeg", false, false)).toBe("image/jpeg");
		expect(storedImageType("image/webp", true, false)).toBe("image/png");
		expect(storedImageType("image/webp", false, true)).toBe("image/jpeg");
	});
});

describe("prepareImage without canvas APIs", () => {
	it("returns the original bytes and sniffed size, not flagged as line art", async () => {
		const bytes = fromBase64(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
		);
		const blob = new Blob([bytes], { type: "image/png" });
		const prepared = await prepareImage(blob, { width: 1, height: 1 });
		expect(prepared.blob).toBe(blob);
		expect(prepared).toMatchObject({ width: 1, height: 1, isLineArt: false });
	});

	it("returns zero size when the header could not be read", async () => {
		const blob = new Blob([Uint8Array.of(1, 2, 3)], { type: "image/bmp" });
		expect(await prepareImage(blob, null)).toMatchObject({ blob, width: 0, height: 0 });
	});
});
