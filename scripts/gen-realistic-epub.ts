import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import JSZip from "jszip";
import { buildEpub } from "../packages/book-import/src/test-fixtures/build-epub";

// Realistic large EPUB: modest plain text (~2MB) but a big incompressible binary
// asset padding the FILE to ~targetMB, mimicking an image/font-heavy book where
// the file is large but extracted text is small.
const targetFileMB = Number(process.argv[2] ?? 50);
const textMB = Number(process.argv[3] ?? 2);
const outPath = process.argv[4] ?? "/tmp/realistic50.epub";

const WORDS = (() => {
	const pool: string[] = [];
	const syl = ["ka", "ro", "men", "tis", "lon", "ver", "ad", "qui", "nor", "fel", "bra", "sum"];
	for (let i = 0; i < 3000; i++) {
		let w = "";
		for (let j = 0; j < 2 + (i % 3); j++) w += syl[(i * 7 + j * 13) % syl.length];
		pool.push(w + i.toString(36));
	}
	return pool;
})();

function paragraph(seed: number): string {
	const words: string[] = [];
	for (let i = 0; i < 40 + (seed % 60); i++) words.push(WORDS[(seed * 31 + i * 17) % WORDS.length]);
	const s = words.join(" ");
	return `<p>${s.charAt(0).toUpperCase() + s.slice(1)}.</p>`;
}

(async () => {
	const textTarget = textMB * 1024 * 1024;
	const chapters: { id: string; href: string; title: string; body: string }[] = [];
	let total = 0;
	let ch = 0;
	let seed = 1;
	while (total < textTarget) {
		ch++;
		const paras: string[] = [];
		let chBytes = 0;
		while (chBytes < 200_000) {
			const p = paragraph(seed++);
			paras.push(p);
			chBytes += p.length;
		}
		const body = paras.join("\n");
		total += body.length;
		chapters.push({ id: `c${ch}`, href: `c${ch}.xhtml`, title: `Chapter ${ch}`, body });
	}

	const base = await buildEpub({ title: "Realistic Big Book", creator: "Bench", chapters });
	const zip = await JSZip.loadAsync(base);
	const padBytes = Math.max(0, targetFileMB * 1024 * 1024 - base.byteLength);
	zip.file("assets/pad.bin", randomBytes(padBytes), { binary: true, compression: "STORE" });
	const out = await zip.generateAsync({ type: "nodebuffer" });
	writeFileSync(outPath, out);
	console.log(
		`text ~${(total / 1024 / 1024).toFixed(1)}MB (${chapters.length} chapters), file ${(out.length / 1024 / 1024).toFixed(1)}MB -> ${outPath}`,
	);
})();
