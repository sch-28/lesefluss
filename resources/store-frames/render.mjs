#!/usr/bin/env node
/**
 * Renders framed store screenshots: source phone capture + device frame +
 * headline on a branded canvas, one PNG per target size.
 *
 * Usage:
 *   node resources/store-frames/render.mjs        # every target in config
 *   node resources/store-frames/render.mjs play   # only the given target ids
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { maxAltLength, maxCopyRatio, slides, targets } from "./config.mjs";
import { buildHtml } from "./template.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.resolve(here, "out");

async function pngSize(file) {
	const head = Buffer.alloc(24);
	const fh = await fs.open(file, "r");
	try {
		await fh.read(head, 0, 24, 0);
	} finally {
		await fh.close();
	}
	if (head.toString("ascii", 1, 4) !== "PNG") {
		throw new Error(`not a PNG: ${file}`);
	}
	return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

const wanted = process.argv.slice(2);
const selected = wanted.length ? targets.filter((t) => wanted.includes(t.id)) : targets;

if (!selected.length) {
	console.error(`no matching target; available: ${targets.map((t) => t.id).join(", ")}`);
	process.exit(1);
}

const badAlt = slides.filter(({ alt }) => !alt || alt.length > maxAltLength);
if (badAlt.length) {
	for (const { name, alt } of badAlt) {
		console.error(
			alt
				? `alt text over ${maxAltLength} chars (${alt.length}): ${name}`
				: `missing alt text: ${name}`,
		);
	}
	process.exit(1);
}

const sizes = new Map(
	await Promise.all(slides.map(async ({ image }) => [image, await pngSize(image)])),
);

const browser = await chromium.launch();
let overCapCount = 0;

try {
	for (const target of selected) {
		const outDir = path.join(outRoot, target.id);
		await fs.mkdir(outDir, { recursive: true });
		const altText = [];

		// Renumbering slides renames files, so stale renders would otherwise pile up.
		const stale = await fs.readdir(outDir);
		await Promise.all(
			stale.filter((file) => file.endsWith(".png")).map((file) => fs.rm(path.join(outDir, file))),
		);

		const page = await browser.newPage({
			viewport: { width: target.width, height: target.height },
			deviceScaleFactor: 1,
		});

		for (const [i, slide] of slides.entries()) {
			const html = buildHtml(slide, target, sizes.get(slide.image));
			const htmlFile = path.join(outDir, ".slide.html");
			const name = `${String(i + 1).padStart(2, "0")}-${slide.name}.png`;
			let copyRatio;

			await fs.writeFile(htmlFile, html);
			try {
				await page.goto(pathToFileURL(htmlFile).href);
				await page.evaluate(() => document.fonts.ready);

				copyRatio = await page.evaluate(
					() => document.querySelector(".copy").getBoundingClientRect().height / window.innerHeight,
				);
				await page.screenshot({ path: path.join(outDir, name) });
			} finally {
				await fs.rm(htmlFile);
			}

			const isOverCap = copyRatio > maxCopyRatio;
			if (isOverCap) overCapCount += 1;
			altText.push({ file: name, alt: slide.alt });
			console.log(
				`${target.id}/${name}  tagline ${(copyRatio * 100).toFixed(1)}%${
					isOverCap ? "  OVER TAGLINE CAP" : ""
				}`,
			);
		}

		await fs.writeFile(
			path.join(outDir, "alt-text.txt"),
			altText.map(({ file, alt }) => `${file}\n${alt}\n`).join("\n"),
		);
		await page.close();
		console.log(
			`${target.id}: ${slides.length} slides at ${target.width}x${target.height} -> ${path.relative(process.cwd(), outDir)}`,
		);
	}
} finally {
	await browser.close();
}

if (overCapCount) {
	console.error(
		`\n${overCapCount} slide(s) exceed the ${maxCopyRatio * 100}% tagline cap; shorten the copy.`,
	);
	process.exit(1);
}
