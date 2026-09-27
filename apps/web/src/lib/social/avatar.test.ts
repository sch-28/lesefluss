// @vitest-environment node
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { encodeAvatar, isAllowedAccountPictureUrl, readBodyCapped } from "./avatar";
import { SocialError } from "./errors";

async function pngWithExif(width: number, height: number): Promise<Buffer> {
	return sharp({
		create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
	})
		.png()
		.withExif({ IFD0: { Copyright: "Jan", ImageDescription: "gps-tagged" } })
		.toBuffer();
}

describe("encodeAvatar", () => {
	test("resizes to a 256px square WebP and drops metadata", async () => {
		const input = await pngWithExif(800, 400);
		expect((await sharp(input).metadata()).exif).toBeDefined();

		const output = await encodeAvatar(input);
		const meta = await sharp(output).metadata();
		expect(meta.format).toBe("webp");
		expect(meta.width).toBe(256);
		expect(meta.height).toBe(256);
		expect(meta.exif).toBeUndefined();
		expect(meta.icc).toBeUndefined();
		expect(meta.xmp).toBeUndefined();
	});

	test("accepts jpeg and webp input", async () => {
		const jpeg = await sharp(await pngWithExif(300, 300))
			.jpeg()
			.toBuffer();
		const webp = await sharp(await pngWithExif(300, 300))
			.webp()
			.toBuffer();
		expect((await sharp(await encodeAvatar(jpeg)).metadata()).format).toBe("webp");
		expect((await sharp(await encodeAvatar(webp)).metadata()).format).toBe("webp");
	});

	test("rejects non-image and unsupported formats", async () => {
		await expect(encodeAvatar(Buffer.from("not an image"))).rejects.toMatchObject({
			code: "unsupported_image",
		});
		const gif = await sharp(await pngWithExif(50, 50))
			.gif()
			.toBuffer();
		await expect(encodeAvatar(gif)).rejects.toMatchObject({ code: "unsupported_image" });
	});

	test("rejects uploads over 5 MB before decoding", async () => {
		const oversized = Buffer.alloc(5_000_001);
		await expect(encodeAvatar(oversized)).rejects.toBeInstanceOf(SocialError);
		await expect(encodeAvatar(oversized)).rejects.toMatchObject({ code: "too_large" });
	});
});

describe("readBodyCapped", () => {
	function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
		return new ReadableStream({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(chunk);
				controller.close();
			},
		});
	}

	test("concatenates chunks under the cap", async () => {
		const out = await readBodyCapped(streamOf([Buffer.from("ab"), Buffer.from("cd")]), 10);
		expect(out.toString()).toBe("abcd");
	});

	test("rejects once the running total exceeds the cap, without a Content-Length", async () => {
		const chunks = [new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)];
		await expect(readBodyCapped(streamOf(chunks), 10)).rejects.toMatchObject({ code: "too_large" });
	});
});

describe("isAllowedAccountPictureUrl", () => {
	test("accepts only https URLs on the provider picture hosts", () => {
		expect(isAllowedAccountPictureUrl("https://lh3.googleusercontent.com/a/abc=s96-c")).toBe(true);
		expect(isAllowedAccountPictureUrl("https://cdn.discordapp.com/avatars/1/2.png")).toBe(true);
		expect(isAllowedAccountPictureUrl("http://lh3.googleusercontent.com/a/abc")).toBe(false);
		expect(isAllowedAccountPictureUrl("https://evil.example/lh3.googleusercontent.com")).toBe(
			false,
		);
		expect(isAllowedAccountPictureUrl("https://notgoogleusercontent.com/x")).toBe(false);
		expect(isAllowedAccountPictureUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
		expect(isAllowedAccountPictureUrl("not a url")).toBe(false);
		expect(isAllowedAccountPictureUrl(null)).toBe(false);
	});
});
