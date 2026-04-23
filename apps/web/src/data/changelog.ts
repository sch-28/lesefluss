export type ChangelogTag = "App" | "ESP32" | "Website";

export type ChangelogEntry = {
	date: string;
	title: string;
	tags: ChangelogTag[];
	changes: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		date: "2026-04-23",
		title: "More Ways to Import: URLs, PDFs, Share Intent",
		tags: ["App"],
		changes: [
			"Paste any article URL to import it as a cleanly-extracted book",
			"Share any webpage or text to Lesefluss from the Android share sheet",
			"PDF import with metadata, cover from page 1, and chapters from bookmarks",
			"Import HTML files through the file picker",
			"Paste plain text from the clipboard as a new book",
			"Redesigned import picker with clearer source labels and descriptions",
		],
	},
	{
		date: "2026-04-22",
		title: "Reader Redesign & Onboarding",
		tags: ["App"],
		changes: [
			"Guided onboarding flow: welcome, speed, theme, reader mode, and sync steps",
			"Optional 'Start with a classic' onboarding step — tap public-domain classics to seed your library",
			"Toggle to hide the active-word underline in the scroll reader",
			"RSVP view re-centred so the focal letter sits in the middle again",
			"Rebuilt RSVP reader with cleaner controls and smoother transitions",
			"Live RSVP preview in the settings screen",
			"Refined sepia theme with better contrast across the app",
			"Fixed RSVP focal letter x-offset setting",
		],
	},
	{
		date: "2026-04-21",
		title: "Play Store Beta & Polish",
		tags: ["App", "Website"],
		changes: [
			"Google Play Store listing link on the download page",
			"Smoother closed-beta request flow",
			"Session handling fixes and formatting polish",
			"Privacy policy updates",
		],
	},
	{
		date: "2026-04-20",
		title: "OAuth, Mobile Login & APK Releases",
		tags: ["App", "Website"],
		changes: [
			"Google and Discord OAuth sign-in",
			"Email verification for new accounts",
			"Mobile login with deep-link callback back into the app",
			"BLE toggle in device settings to disable Bluetooth scanning",
			"Automated APK release pipeline with signed builds",
			"New download page and website login hint for web-app visitors",
		],
	},
	{
		date: "2026-04-19",
		title: "Explore Tab: Discover Public-Domain Books",
		tags: ["App", "Website"],
		changes: [
			"Browse thousands of free books from Project Gutenberg and Standard Ebooks",
			"Landing page with featured, classics, most-read, and random shelves",
			"Rotating featured hero with manual navigation",
			"Genre filtering across 8 curated categories",
			"Full-text search with typo tolerance and language filter",
			"Classic page-number pagination with auto scroll-to-top",
			"One-tap download to import a book into your library",
			"Polished book detail pages with source badge and descriptions",
			"Smooth cover loading with skeleton shimmer and async decoding",
		],
	},
	{
		date: "2026-04-18",
		title: "Profile, Admin & Analytics",
		tags: ["Website"],
		changes: [
			"Public profile page with reading stats, library, and highlights",
			"Account page for password management and danger zone",
			"Admin dashboard for user and book management",
			"Web app highlighting support",
			"Analytics integration and SEO hardening (CSP, security headers)",
			"App icon and OG image",
		],
	},
	{
		date: "2026-04-15",
		title: "Web App & Cloud Sync",
		tags: ["App", "Website"],
		changes: [
			"Web app live at lesefluss.app/app - full reader in the browser",
			"Cloud sync: books, settings, and highlights backed up automatically",
			"Desktop sidebar navigation for the web version",
			"Privacy policy, Terms of Service, and Imprint pages",
		],
	},
	{
		date: "2026-04-13",
		title: "In-App RSVP Reader, Highlights & Library",
		tags: ["App"],
		changes: [
			"Full RSVP reader in the mobile app (software parity with ESP32)",
			"Reading themes: dark, sepia, light",
			"Progress bar with tap and drag scrubbing",
			"Highlight and annotate text with color swatches",
			"Dictionary lookup via tap on any word",
			"Library sorting and filtering (title, author, progress, date)",
			"Reading time estimation",
		],
	},
	{
		date: "2026-04-08",
		title: "AMOLED Display & Device Polish",
		tags: ["ESP32", "App"],
		changes: [
			"AMOLED (RM67162) display support alongside ST7789",
			"Encoder scrubbing mode: rotate to step through words",
			"Keep display on during book transfer",
			"Fixed BLE window-size issue on AMOLED boards",
			"Transfer wake: display activates automatically during upload",
		],
	},
	{
		date: "2026-04-03",
		title: "ESP32 Deep Sleep & Brightness",
		tags: ["ESP32"],
		changes: [
			"Deep sleep with configurable idle timeout - weeks of battery life",
			"Brightness control (10–100 %) synced from the app",
			"Dark / inverse mode support on device",
			"ESP32 firmware simplified and restructured; WiFi removed",
			"Improved BLE connection stability",
		],
	},
	{
		date: "2026-03-26",
		title: "Initial Release",
		tags: ["App", "ESP32"],
		changes: [
			"Core RSVP reader on ESP32 with focal letter (ORP) positioning",
			"Companion mobile app: settings sync over BLE",
			"EPUB and TXT book import",
			"Chunked BLE book transfer to device",
			"Bidirectional position sync between device and app",
			"Library with metadata and cover extraction",
			"Auto-connect to last paired device",
		],
	},
];
