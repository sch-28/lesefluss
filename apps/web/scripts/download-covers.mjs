#!/usr/bin/env node
// One-time script: fetches famous book covers from catalog, resizes to WebP, writes manifest.
// Run from repo root: node apps/web/scripts/download-covers.mjs

import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const CATALOG = "https://catalog.lesefluss.app";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../public/covers");
const MANIFEST = path.join(__dirname, "../src/lib/static-covers.json");
const WIDTH = 328;
const HEIGHT = 480;
const QUALITY = 80;

mkdirSync(OUT_DIR, { recursive: true });

const res = await fetch(`${CATALOG}/landing?lang=en`);
if (!res.ok) throw new Error(`Landing fetch failed: ${res.status}`);
const data = await res.json();

const featuredSe = data.featured_se ?? [];
const classics = data.classics ?? [];
const mostRead = data.most_read ?? [];

// Merge, deduplicate, and keep only Standard Ebooks (se: prefix) for consistent cover quality
const seen = new Set();
const books = [];
for (const b of [...featuredSe, ...classics, ...mostRead]) {
	if (!seen.has(b.id) && b.id.startsWith("se:")) {
		seen.add(b.id);
		books.push(b);
	}
}

console.error(
	`Found ${books.length} SE books (${featuredSe.length} featured + ${classics.length} classics + ${mostRead.length} most_read)`,
);

const manifest = [];
let ok = 0;
let fail = 0;

for (const book of books) {
	const rest = book.id.slice("se:".length);
	if (!rest) {
		console.error(`  skip: bad id ${book.id}`);
		fail++;
		continue;
	}
	const coverUrl = `${CATALOG}/covers/se/${rest}`;

	// Use slug as filename (replace slashes with __)
	const slug = rest.replace(/\//g, "__");
	const outFile = `${slug}.webp`;
	const outPath = path.join(OUT_DIR, outFile);

	process.stderr.write(`  ${book.title} ... `);
	try {
		const imgRes = await fetch(coverUrl);
		if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
		const buf = Buffer.from(await imgRes.arrayBuffer());
		await sharp(buf)
			.resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" })
			.webp({ quality: QUALITY })
			.toFile(outPath);
		manifest.push({ id: book.id, title: book.title, author: book.author, file: outFile });
		process.stderr.write("ok\n");
		ok++;
	} catch (err) {
		process.stderr.write(`FAILED: ${err.message}\n`);
		fail++;
	}
}

await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.error(`\nDone: ${ok} ok, ${fail} failed. Manifest written to ${MANIFEST}`);
