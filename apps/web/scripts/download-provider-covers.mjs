#!/usr/bin/env node
// One-time script: fetches well-known web-novel covers from each provider,
// resizes to WebP, writes a manifest. Run from repo root:
//   node apps/web/scripts/download-provider-covers.mjs

import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = path.join(__dirname, "../public/covers/providers");
const MANIFEST = path.join(__dirname, "../src/lib/provider-covers.json");
const WIDTH = 240;
const HEIGHT = 346;
const QUALITY = 80;
const UA =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const SERIES = [
	// Royal Road
	{
		provider: "royalroad",
		slug: "the-wandering-inn",
		title: "The Wandering Inn",
		sourceUrl: "https://www.royalroad.com/fiction/25137/the-wandering-inn",
	},
	{
		provider: "royalroad",
		slug: "mother-of-learning",
		title: "Mother of Learning",
		sourceUrl: "https://www.royalroad.com/fiction/21220/mother-of-learning",
	},
	{
		provider: "royalroad",
		slug: "he-who-fights-with-monsters",
		title: "He Who Fights with Monsters",
		sourceUrl: "https://www.royalroad.com/fiction/26294/he-who-fights-with-monsters",
	},
	// Wuxiaworld
	{
		provider: "wuxiaworld",
		slug: "coiling-dragon",
		title: "Coiling Dragon",
		sourceUrl: "https://www.wuxiaworld.com/novel/coiling-dragon",
	},
	{
		provider: "wuxiaworld",
		slug: "i-shall-seal-the-heavens",
		title: "I Shall Seal the Heavens",
		sourceUrl: "https://www.wuxiaworld.com/novel/i-shall-seal-the-heavens",
	},
	{
		provider: "wuxiaworld",
		slug: "martial-god-asura",
		title: "Martial God Asura",
		sourceUrl: "https://www.wuxiaworld.com/novel/martial-god-asura",
	},
	// ScribbleHub
	{
		provider: "scribblehub",
		slug: "salvos",
		title: "Salvos",
		sourceUrl: "https://www.scribblehub.com/series/204714/salvos-a-monster-evolution-litrpg/",
	},
	{
		provider: "scribblehub",
		slug: "re-trailer-trash",
		title: "RE: Trailer Trash",
		sourceUrl: "https://www.scribblehub.com/series/33423/re-trailer-trash/",
	},
	{
		provider: "scribblehub",
		slug: "mark-of-the-crijik",
		title: "Mark of the Crijik",
		sourceUrl: "https://www.scribblehub.com/series/478173/mark-of-the-crijik/",
	},
];

function extractRoyalRoad(html) {
	const m = html.match(/<img[^>]+data-type=['"]cover['"][^>]+src=['"]([^'"]+)['"]/i);
	if (m) return m[1];
	const og = html.match(/<meta[^>]+property=['"]og:image['"][^>]+content=['"]([^'"]+)['"]/i);
	return og?.[1] ?? null;
}

function extractScribbleHub(html) {
	const m = html.match(
		/<div[^>]+class=['"][^'"]*fic_image[^'"]*['"][^>]*>\s*(?:<a[^>]*>\s*)?<img[^>]+src=['"]([^'"]+)['"]/i,
	);
	if (m) return m[1];
	const og = html.match(/<meta[^>]+property=['"]og:image['"][^>]+content=['"]([^'"]+)['"]/i);
	return og?.[1] ?? null;
}

function extractWuxiaworld(html) {
	// Prefer og:image — Wuxiaworld sets it to the cover and it's far more
	// stable than digging into their react-query payload.
	const og = html.match(/<meta[^>]+property=['"]og:image['"][^>]+content=['"]([^'"]+)['"]/i);
	if (og) return og[1];
	const m = html.match(/"coverUrl"\s*:\s*\{\s*"value"\s*:\s*"([^"]+)"/);
	return m?.[1] ?? null;
}

const EXTRACTORS = {
	royalroad: extractRoyalRoad,
	scribblehub: extractScribbleHub,
	wuxiaworld: extractWuxiaworld,
};

async function fetchHtml(url) {
	const res = await fetch(url, {
		headers: {
			"User-Agent": UA,
			Accept: "text/html,application/xhtml+xml",
			"Accept-Language": "en-US,en;q=0.9",
		},
	});
	if (!res.ok) throw new Error(`HTML fetch ${res.status}`);
	return await res.text();
}

async function fetchImage(url, referer) {
	const res = await fetch(url, {
		headers: { "User-Agent": UA, Referer: referer },
	});
	if (!res.ok) throw new Error(`image fetch ${res.status}`);
	return Buffer.from(await res.arrayBuffer());
}

const manifest = [];
let ok = 0;
let fail = 0;

for (const entry of SERIES) {
	const outDir = path.join(OUT_ROOT, entry.provider);
	mkdirSync(outDir, { recursive: true });
	const outFile = `${entry.slug}.webp`;
	const outPath = path.join(outDir, outFile);

	process.stderr.write(`[${entry.provider}] ${entry.title} ... `);
	try {
		const html = await fetchHtml(entry.sourceUrl);
		const coverUrl = EXTRACTORS[entry.provider](html);
		if (!coverUrl) throw new Error("cover URL not found in HTML");
		const abs = new URL(coverUrl, entry.sourceUrl).toString();
		const buf = await fetchImage(abs, entry.sourceUrl);
		await sharp(buf)
			.resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" })
			.webp({ quality: QUALITY })
			.toFile(outPath);
		manifest.push({
			provider: entry.provider,
			slug: entry.slug,
			title: entry.title,
			file: `${entry.provider}/${outFile}`,
		});
		process.stderr.write("ok\n");
		ok++;
	} catch (err) {
		process.stderr.write(`FAILED: ${err.message}\n`);
		fail++;
	}
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.error(`\nDone: ${ok} ok, ${fail} failed. Manifest: ${MANIFEST}`);
