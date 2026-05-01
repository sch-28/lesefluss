/**
 * Sample a base64 cover image to pull a dominant-ish color, then derive a
 * complementary gradient. Cached per-image to avoid re-decoding.
 *
 * Approach: small offscreen canvas, average all pixels weighted by saturation
 * (so we don't end up with mud-grey from book backgrounds). Cheap and good
 * enough for a hero accent.
 */

const cache = new Map<string, { from: string; to: string }>();

export async function extractAccent(
	dataUrl: string | null | undefined,
	fallback: { from: string; to: string },
	cacheKey?: string,
): Promise<{ from: string; to: string }> {
	if (!dataUrl) return fallback;
	const key = cacheKey ?? dataUrl;
	const cached = cache.get(key);
	if (cached) return cached;

	try {
		const img = await loadImage(dataUrl);
		const canvas = document.createElement("canvas");
		const SIZE = 32;
		canvas.width = SIZE;
		canvas.height = SIZE;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return fallback;
		ctx.drawImage(img, 0, 0, SIZE, SIZE);
		const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

		let r = 0;
		let g = 0;
		let b = 0;
		let weight = 0;
		for (let i = 0; i < data.length; i += 4) {
			const pr = data[i];
			const pg = data[i + 1];
			const pb = data[i + 2];
			const max = Math.max(pr, pg, pb);
			const min = Math.min(pr, pg, pb);
			// Saturation × value. Pixel weight: skip near-black/white.
			const sat = max === 0 ? 0 : (max - min) / max;
			const val = max / 255;
			const w = sat * val;
			r += pr * w;
			g += pg * w;
			b += pb * w;
			weight += w;
		}
		if (weight < 1) return fallback;
		r = Math.round(r / weight);
		g = Math.round(g / weight);
		b = Math.round(b / weight);

		const from = `rgb(${r}, ${g}, ${b})`;
		// Shift hue ~30° via a cheap channel rotation for the second stop.
		const to = `rgb(${clamp(b * 0.9 + 30)}, ${clamp(r * 0.9 + 20)}, ${clamp(g * 0.9 + 50)})`;
		const result = { from, to };
		cache.set(key, result);
		return result;
	} catch {
		return fallback;
	}
}

function clamp(n: number): number {
	return Math.max(0, Math.min(255, Math.round(n)));
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}
