// The reader's bundled fonts (OFL-1.1, licence texts in src/assets/licenses/fonts).
// woff2 only, regular and bold. Each face downloads only once text needs it, and
// the latin / latin-ext subsets only for characters in their ranges (fontsource's).
// OpenDyslexic is its one complete latin file, unmodified, so no range.
import atkinsonLatin400 from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2?url";
import atkinsonLatin700 from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2?url";
import atkinsonLatinExt400 from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-ext-400-normal.woff2?url";
import atkinsonLatinExt700 from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-ext-700-normal.woff2?url";
import literataLatin400 from "@fontsource/literata/files/literata-latin-400-normal.woff2?url";
import literataLatin700 from "@fontsource/literata/files/literata-latin-700-normal.woff2?url";
import literataLatinExt400 from "@fontsource/literata/files/literata-latin-ext-400-normal.woff2?url";
import literataLatinExt700 from "@fontsource/literata/files/literata-latin-ext-700-normal.woff2?url";
import openDyslexicLatin400 from "@fontsource/opendyslexic/files/opendyslexic-latin-400-normal.woff2?url";
import openDyslexicLatin700 from "@fontsource/opendyslexic/files/opendyslexic-latin-700-normal.woff2?url";

const LATIN =
	"U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
	"U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

const FACES: { family: string; weight: 400 | 700; url: string; unicodeRange?: string }[] = [
	{ family: "Atkinson Hyperlegible", weight: 400, url: atkinsonLatin400, unicodeRange: LATIN },
	{
		family: "Atkinson Hyperlegible",
		weight: 400,
		url: atkinsonLatinExt400,
		unicodeRange: LATIN_EXT,
	},
	{ family: "Atkinson Hyperlegible", weight: 700, url: atkinsonLatin700, unicodeRange: LATIN },
	{
		family: "Atkinson Hyperlegible",
		weight: 700,
		url: atkinsonLatinExt700,
		unicodeRange: LATIN_EXT,
	},
	{ family: "OpenDyslexic", weight: 400, url: openDyslexicLatin400 },
	{ family: "OpenDyslexic", weight: 700, url: openDyslexicLatin700 },
	{ family: "Literata", weight: 400, url: literataLatin400, unicodeRange: LATIN },
	{ family: "Literata", weight: 400, url: literataLatinExt400, unicodeRange: LATIN_EXT },
	{ family: "Literata", weight: 700, url: literataLatin700, unicodeRange: LATIN },
	{ family: "Literata", weight: 700, url: literataLatinExt700, unicodeRange: LATIN_EXT },
];

/** Makes the bundled faces available to CSS and `document.fonts.load`; nothing downloads yet. */
export function registerReaderFonts(): void {
	if (!document.fonts || typeof FontFace === "undefined") return;
	for (const { family, weight, url, unicodeRange } of FACES) {
		document.fonts.add(
			new FontFace(family, `url("${url}") format("woff2")`, {
				weight: String(weight),
				style: "normal",
				display: "swap",
				...(unicodeRange && { unicodeRange }),
			}),
		);
	}
}
