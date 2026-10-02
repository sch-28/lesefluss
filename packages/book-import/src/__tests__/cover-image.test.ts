import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	COVER_BUDGET_BYTES,
	COVER_MAX_SIDE,
	normalizeCover,
	normalizeCoverDataUrl,
	resetCoverEncoderProbe,
} from "../utils/cover-image";
import { arrayBufferToBase64 } from "../utils/encoding";
import { MAX_DECODE_PIXELS } from "../utils/image-analysis";

type FakeBitmap = { width: number; height: number; transparent: boolean; close(): void };
type EncodeCall = { width: number; height: number; type: string; quality?: number };

/** A blob whose header sniffs as a PNG of the given size, padded to `bytes`. */
function pngBlob(width: number, height: number, bytes: number): Blob {
	const b = new Uint8Array(Math.max(bytes, 24));
	b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
	new DataView(b.buffer).setUint32(16, width);
	new DataView(b.buffer).setUint32(20, height);
	return new Blob([b], { type: "image/png" });
}

let encodeCalls: EncodeCall[];
let webpSupported: boolean;
/** Encoded bytes per pixel at quality 1; scaled by quality for lossy types. */
let bytesPerPixel: number;
let decodeSpec: { transparent: boolean };
/** Mimics `canvas.toBlob` handing back null for a WebP request. */
let webpYieldsNull: boolean;

class FakeOffscreenCanvas {
	private source: FakeBitmap | null = null;
	constructor(
		readonly width: number,
		readonly height: number,
	) {}
	getContext() {
		return {
			drawImage: (src: FakeBitmap) => {
				this.source = src;
			},
			getImageData: (_x: number, _y: number, w: number, h: number) => {
				const data = new Uint8ClampedArray(w * h * 4).fill(200);
				if (this.source?.transparent) data[3] = 0;
				else for (let i = 3; i < data.length; i += 4) data[i] = 255;
				return { data };
			},
		};
	}
	async convertToBlob({ type, quality }: { type: string; quality?: number }): Promise<Blob | null> {
		if (type === "image/webp" && webpYieldsNull) {
			encodeCalls.push({ width: this.width, height: this.height, type: "null", quality });
			return null;
		}
		const actual = type === "image/webp" && !webpSupported ? "image/png" : type;
		encodeCalls.push({ width: this.width, height: this.height, type: actual, quality });
		const lossy = actual !== "image/png";
		const size = Math.round(
			this.width * this.height * bytesPerPixel * (lossy ? (quality ?? 1) : 1),
		);
		return new Blob([new Uint8Array(size)], { type: actual });
	}
}

const createImageBitmapMock = vi.fn(async (blob: Blob): Promise<FakeBitmap> => {
	const head = new DataView(await blob.slice(0, 24).arrayBuffer());
	return {
		width: head.getUint32(16),
		height: head.getUint32(20),
		transparent: decodeSpec.transparent,
		close() {},
	};
});

beforeEach(() => {
	encodeCalls = [];
	webpSupported = true;
	bytesPerPixel = 0.05;
	decodeSpec = { transparent: false };
	webpYieldsNull = false;
	resetCoverEncoderProbe();
	createImageBitmapMock.mockClear();
	vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
	vi.stubGlobal("createImageBitmap", createImageBitmapMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const finalEncodes = () => encodeCalls.filter((c) => c.width > 32);

describe("normalizeCover", () => {
	it("caps the longest side at COVER_MAX_SIDE, keeping the aspect ratio", async () => {
		const out = await normalizeCover(pngBlob(1600, 2400, 500_000));
		expect(out.type).toBe("image/webp");
		const [first] = finalEncodes();
		expect(first).toMatchObject({ width: 400, height: COVER_MAX_SIDE });
	});

	it("never upscales a small but heavy cover", async () => {
		const gif = new Blob([await pngBlob(300, 450, 200_000).arrayBuffer()], { type: "image/gif" });
		await normalizeCover(gif);
		expect(finalEncodes()[0]).toMatchObject({ width: 300, height: 450 });
	});

	it("steps down quality until the cover fits the budget", async () => {
		// 400 x 600 x 0.2 = 48 000 B at q1: 0.8 and 0.65 are over 30 KiB, 0.5 fits.
		bytesPerPixel = 0.2;
		const out = await normalizeCover(pngBlob(1600, 2400, 500_000));
		expect(out.size).toBeLessThanOrEqual(COVER_BUDGET_BYTES);
		expect(finalEncodes().map((c) => c.quality)).toEqual([0.8, 0.65, 0.5]);
	});

	it("falls back to a smaller size, and keeps the smallest attempt, when nothing fits", async () => {
		bytesPerPixel = 2;
		const out = await normalizeCover(pngBlob(1600, 2400, 5_000_000));
		const calls = finalEncodes();
		expect(calls.at(-1)).toMatchObject({ width: 267, height: 400 });
		expect(out.size).toBe(
			Math.min(...calls.map((c) => Math.round(c.width * c.height * 2 * (c.quality ?? 1)))),
		);
	});

	it("encodes JPEG where WebP is unavailable", async () => {
		webpSupported = false;
		const out = await normalizeCover(pngBlob(1600, 2400, 500_000));
		expect(out.type).toBe("image/jpeg");
	});

	it("keeps transparency as PNG when WebP is unavailable", async () => {
		webpSupported = false;
		decodeSpec = { transparent: true };
		const out = await normalizeCover(pngBlob(1600, 2400, 500_000));
		expect(out.type).toBe("image/png");
		expect(encodeCalls.some((c) => c.type === "image/jpeg")).toBe(false);
	});

	it("keeps transparency in WebP where it is available", async () => {
		decodeSpec = { transparent: true };
		const out = await normalizeCover(pngBlob(1600, 2400, 500_000));
		expect(out.type).toBe("image/webp");
	});

	it("returns a cover already within limits untouched, without decoding", async () => {
		const small = pngBlob(400, 600, 20_000);
		expect(await normalizeCover(small)).toBe(small);
		expect(createImageBitmapMock).not.toHaveBeenCalled();
	});

	it("keeps the original when re-encoding would not shrink it", async () => {
		bytesPerPixel = 4;
		const original = pngBlob(1000, 1000, 40_000);
		expect(await normalizeCover(original)).toBe(original);
	});

	it("treats a stored-format cover within COVER_MAX_SIDE as final, even over budget", async () => {
		const heavy = pngBlob(400, 600, 200_000);
		expect(await normalizeCover(heavy)).toBe(heavy);
		expect(createImageBitmapMock).not.toHaveBeenCalled();
	});

	it("re-encodes a small cover in a format we do not store", async () => {
		const gif = new Blob([await pngBlob(400, 600, 200_000).arrayBuffer()], { type: "image/gif" });
		const out = await normalizeCover(gif);
		expect(out.type).toBe("image/webp");
	});

	it("does not decode an image declaring more than MAX_DECODE_PIXELS", async () => {
		const huge = pngBlob(MAX_DECODE_PIXELS, 2, 500_000);
		expect(await normalizeCover(huge)).toBe(huge);
		expect(createImageBitmapMock).not.toHaveBeenCalled();
	});

	it("does not decode an image whose size cannot be read from the header", async () => {
		const unknown = new Blob([new Uint8Array(500_000)], { type: "image/jpeg" });
		expect(await normalizeCover(unknown)).toBe(unknown);
		expect(createImageBitmapMock).not.toHaveBeenCalled();
	});

	it("skips quality rungs for PNG, which ignores quality", async () => {
		webpSupported = false;
		decodeSpec = { transparent: true };
		bytesPerPixel = 2;
		await normalizeCover(pngBlob(1600, 2400, 5_000_000));
		const png = finalEncodes().filter((c) => c.type === "image/png");
		// The first is the WebP probe that came back as PNG.
		expect(png.map((c) => [c.width, c.height])).toEqual([
			[400, 600],
			[400, 600],
			[267, 400],
		]);
	});

	it("probes WebP again when the encoder handed back nothing", async () => {
		webpYieldsNull = true;
		bytesPerPixel = 2;
		const out = await normalizeCover(pngBlob(1600, 2400, 5_000_000));
		expect(out.type).toBe("image/jpeg");
		expect(finalEncodes().filter((c) => c.type === "null")).toHaveLength(4);
	});

	it("keeps the original where the runtime cannot decode", async () => {
		vi.stubGlobal("createImageBitmap", undefined);
		const original = pngBlob(1600, 2400, 500_000);
		expect(await normalizeCover(original)).toBe(original);
	});

	it("keeps the original when decoding throws", async () => {
		createImageBitmapMock.mockRejectedValueOnce(new Error("bad image"));
		const original = pngBlob(1600, 2400, 500_000);
		expect(await normalizeCover(original)).toBe(original);
	});
});

describe("normalizeCoverDataUrl", () => {
	it("passes null and remote URLs through", async () => {
		expect(await normalizeCoverDataUrl(null)).toBeNull();
		const remote = "https://www.royalroadcdn.com/public/covers-large/1.jpg";
		expect(await normalizeCoverDataUrl(remote)).toBe(remote);
		expect(createImageBitmapMock).not.toHaveBeenCalled();
	});

	it("re-encodes an oversized data URL cover", async () => {
		const big = pngBlob(1600, 2400, 500_000);
		const dataUrl = `data:image/png;base64,${arrayBufferToBase64(await big.arrayBuffer())}`;
		const out = await normalizeCoverDataUrl(dataUrl);
		expect(out?.startsWith("data:image/webp;base64,")).toBe(true);
		expect(out?.length).toBeLessThan(dataUrl.length);
	});

	it("returns the same string for a cover within limits", async () => {
		const small = pngBlob(200, 300, 5_000);
		const dataUrl = `data:image/png;base64,${arrayBufferToBase64(await small.arrayBuffer())}`;
		expect(await normalizeCoverDataUrl(dataUrl)).toBe(dataUrl);
	});
});
