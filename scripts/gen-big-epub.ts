import { writeFileSync } from "node:fs";
import { buildEpubBuffer } from "../packages/book-import/src/test-fixtures/build-epub";

const targetRawMB = Number(process.argv[2] ?? 110);
const outPath = process.argv[3] ?? "/tmp/big.epub";

const WORDS = (() => {
	const pool: string[] = [];
	const syl = [
		"ka",
		"ro",
		"men",
		"tis",
		"lon",
		"ver",
		"ad",
		"qui",
		"nor",
		"fel",
		"bra",
		"sum",
		"tel",
		"wic",
		"dor",
		"pha",
	];
	for (let i = 0; i < 4000; i++) {
		const n = 2 + (i % 3);
		let w = "";
		for (let j = 0; j < n; j++) w += syl[(i * 7 + j * 13) % syl.length];
		pool.push(`${w}${i.toString(36)}`);
	}
	return pool;
})();

function paragraph(seed: number): string {
	const len = 40 + (seed % 60);
	const words: string[] = [];
	for (let i = 0; i < len; i++) words.push(WORDS[(seed * 31 + i * 17) % WORDS.length]);
	let s = words.join(" ");
	s = s.charAt(0).toUpperCase() + s.slice(1) + ".";
	return `<p>${s}</p>`;
}

const targetBytes = targetRawMB * 1024 * 1024;
const chapters: { id: string; href: string; title: string; body: string }[] = [];
let total = 0;
let ch = 0;
let seed = 1;
while (total < targetBytes) {
	ch++;
	const paras: string[] = [];
	let chBytes = 0;
	while (chBytes < 500_000) {
		const p = paragraph(seed++);
		paras.push(p);
		chBytes += p.length;
	}
	const body = paras.join("\n");
	total += body.length;
	chapters.push({ id: `c${ch}`, href: `c${ch}.xhtml`, title: `Chapter ${ch}`, body });
}

console.log(`raw text ~${(total / 1024 / 1024).toFixed(1)}MB across ${chapters.length} chapters`);

(async () => {
	const buffer = await buildEpubBuffer({ title: "Big Test Book", creator: "Bench", chapters });
	writeFileSync(outPath, buffer);
	console.log(`wrote ${outPath} = ${(buffer.length / 1024 / 1024).toFixed(1)}MB epub file`);
})();
