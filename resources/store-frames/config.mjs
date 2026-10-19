import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

const sourceShot = (name) => path.join(repoRoot, "resources/screenshots-2", name);

/**
 * Canvas sizes the stores accept. Play needs 16:9 or 9:16 with both sides
 * >= 1080; Apple's 6.9" slot takes 1320x2868. Rendering larger than this only
 * upscales the source screenshots, so these are the ceiling, not a minimum.
 */
export const targets = [
	{ id: "play", width: 1440, height: 2560, platform: "android" },
	{ id: "ios-69", width: 1320, height: 2868, platform: "ios" },
];

/**
 * Fraction cropped off the bottom of every phone capture. Removes the gesture
 * pill, which would otherwise survive on the taller Apple canvas.
 */
export const cropBottom = 0.022;

/**
 * Play requires battery, WiFi and cell icons to be full and the bar free of
 * notifications, so the captured bar is covered by a synthetic one. The app
 * paints a flat #100b09 behind it, which is what makes the overlay seamless.
 */
export const statusBar = {
	colors: { background: "#100b09", foreground: "#f2f2f2" },
	// iOS keeps the bar clear of the Dynamic Island (taller, wider side insets)
	// and 9:41 is Apple's own convention in marketing shots.
	platforms: {
		android: { time: "9:41", height: 0.049, inset: 0.065 },
		ios: { time: "9:41", height: 0.062, inset: 0.115 },
	},
};

export const theme = {
	ink: "#080605",
	accent: "#d9603f",
	green: "#2ec27e",
	headline: "#f7f4f2",
	subline: "#b3aaa5",
	bezel: "#231c19",
};

/**
 * How far the framed screen may be scaled past the source pixels. The Apple
 * canvas is taller than the captures, so without some headroom the phone stops
 * short and leaves a dead band under the tagline.
 */
export const maxUpscale = 1.2;

/**
 * Budget for the headline and subline block, as a fraction of canvas height.
 * Measures the text box alone; the padding above it and the gap below the
 * device are deliberately not counted.
 */
export const maxCopyRatio = 0.2;

/** Play truncates longer alt text in the listing editor. */
export const maxAltLength = 140;

export const slides = [
	{
		name: "rsvp",
		image: sourceShot("rsvp.png"),
		headline: "One word at a time",
		subline: "RSVP flashes the text so a chapter fits in the time you'd spend scrolling.",
		alt: "The RSVP reader showing a single word with speed controls set to 350 words per minute.",
	},
	{
		name: "reader",
		image: sourceShot("reading.png"),
		headline: "Or take it slow",
		subline: "Same book, same position. Switch between both readers any time.",
		alt: "The scroll reader showing a chapter of a novel in large, high contrast type.",
	},
	{
		name: "library",
		image: sourceShot("library.png"),
		headline: "One shelf, every device",
		subline: "Phone and web stay in sync, down to your position in the book.",
		alt: "The library grid with book covers and a progress bar under each one.",
	},
	{
		name: "explore",
		image: sourceShot("explore.png"),
		headline: "Something to read",
		subline: "Gutenberg classics plus serials from Royal Road, AO3 and Wuxiaworld.",
		alt: "The explore tab with a featured classic, web novel sources and rows of free books.",
	},
	{
		name: "streak",
		image: sourceShot("global-stats-1.png"),
		headline: "A streak you can see",
		subline: "Days read, hours logged, and the words already behind you.",
		alt: "The reading stats screen with a streak calendar, total time, words read and books finished.",
	},
	{
		name: "speed",
		image: sourceShot("global-stats-2.png"),
		headline: "When you actually read",
		subline: "Speed over the months, hours of the day, and your own records.",
		alt: "Charts of reading speed over time and reading minutes per hour of day, with personal records.",
	},
	{
		name: "book-stats",
		image: sourceShot("book-stats.png"),
		headline: "Every book keeps a record",
		subline: "Time read, sittings, and how your speed moved while you read it.",
		alt: "A single book page showing time read, sittings, progress and a speed chart for that book.",
	},
];
