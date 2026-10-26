import { readerFontFace } from "../../hooks/use-appearance-settings";

export type ReaderFont = { family: string; isBold: boolean };

/** Past this the text lays out in the fallback rather than not at all. */
const LOAD_TIMEOUT_MS = 3000;

/** Both weights the reader shows: bold text and headings use the 700 face. */
const READER_WEIGHTS = [400, 700] as const;

/**
 * Resolves once text can be laid out in the reader font, regular and bold.
 * A face nothing has used yet still reports `document.fonts.status ===
 * "loaded"`, so the status says nothing; `load()` fetches it. Loading both
 * weights up front keeps a heading from fetching the bold face mid-scroll.
 * Never rejects: a face that fails or hangs leaves the fallback, as before the
 * fonts were bundled.
 */
export async function loadReaderFont(family: string): Promise<void> {
	const face = readerFontFace(family);
	if (!face || !document.fonts) return;
	const loads = Promise.all(
		READER_WEIGHTS.map((weight) => document.fonts.load(`${weight} 1em "${face}"`)),
	).then(
		() => undefined,
		() => undefined,
	);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, LOAD_TIMEOUT_MS);
	});
	await Promise.race([loads, timeout]);
	clearTimeout(timer);
}

/** Whether a `loadingdone` event loaded a face of `face`'s family. */
export function hasLoadedFace(event: Event, face: string): boolean {
	const faces = (event as FontFaceSetLoadEvent).fontfaces ?? [];
	return faces.some((f) => f.family.replace(/^["']|["']$/g, "") === face);
}
