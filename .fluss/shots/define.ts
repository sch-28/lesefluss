// Imports nothing, so another repo can vendor this file next to its `.fluss/shots.config.ts`.

export type ShotTheme = "light" | "dark";

export type ShotContext = {
	baseUrl: string;
	size: number;
	theme: ShotTheme;
	/** The ref's label (the ref as given, HEAD as its branch, WORKTREE as its ticket) and its sha; WORKTREE has none. */
	ref: { label: string; sha: string | null };
	/** The fixed time the page's clock shows; seeds use explicit dates from it. */
	now: Date;
};

export type ShotCapture =
	| "viewport"
	| "fullPage"
	| { clip: { x: number; y: number; width: number; height: number } };

/** One screen of the registry. `Page` is the project's own Playwright `Page`. */
export type ShotScreen<Page> = {
	id: string;
	area: string;
	/** `full` unless the screen shows a loading, empty or few-data state; each state is its own screen id. */
	dataState?: string;
	/** The screen exists from this commit on (an ancestor check); before it, its cells are not-in-ref. */
	since?: string;
	/** The screen is gone from this commit on. */
	until?: string;
	/** Run after `go`: false means the ref has no such screen (not-in-ref, not a timeout). */
	probe?: (page: Page, ctx: ShotContext) => Promise<boolean>;
	go: (page: Page, ctx: ShotContext) => Promise<void>;
	ready?: (page: Page, ctx: ShotContext) => Promise<void>;
	capture?: ShotCapture;
	/** Globs of the files that change this screen, for `--changed`. */
	paths?: string[];
	/** The route this screen shows, as `routes.list` names it, for the coverage check. */
	route?: string;
};

/** Commands for the refs from `since` on (an ancestor check); the last matching entry wins. */
export type ShotCommands = {
	since?: string;
	/** Default: `pnpm install --offline --frozen-lockfile --filter <filter>...`. */
	install?: string;
	build: string;
	/** Gets `PORT`; `{port}` in the command is replaced too. */
	serve: string;
};

export type ShotsConfig<Page> = {
	/** The web app's package directory, relative to the repo root. */
	app: string;
	/** pnpm filter for the install; default the app's package name. */
	filter?: string;
	/** The package directory whose installed Playwright shoots; default `app`. */
	playwright?: string;
	/** A Chromium to launch instead of Playwright's own download, e.g. a system `/usr/bin/chromium`. */
	executablePath?: string;
	commands: ShotCommands[];
	/** Non-secret env for install, setup, build, services and serve; nothing else of the shell's env passes but basics like PATH and HOME. */
	env?: Record<string, string>;
	/** Run once per ref after the install, before the build, in the ref's export. */
	setup?: string;
	/** Run in the ref's export: start, then migrate (that ref's migrations), and stop after the capture, also on failure. */
	services?: {
		start: string;
		migrate?: string;
		stop: string;
		/** Host ports the served app reaches (the database); the capture runs without outside network and relays only these. */
		ports?: number[];
	};
	/** Fills the app once per browser context (phone, desktop), with the clock already fixed. */
	seed?: (page: Page, ctx: ShotContext) => Promise<void>;
	/** Script source run before the app's own scripts, to set the theme before boot. */
	themeScript?: (theme: ShotTheme) => string;
	/** ISO time the clock is fixed to; default 2026-01-15T10:00:00Z. */
	fixedTime?: string;
	sizes?: number[];
	themes?: ShotTheme[];
	timeouts?: { cellMs?: number; refMs?: number; serveMs?: number };
	screens: ShotScreen<Page>[];
	/**
	 * The coverage check: every route `list` returns needs a screen with that `route` or an
	 * `ignore` entry whose value says why it is not shot.
	 */
	routes?: {
		list: (root: string) => string[] | Promise<string[]>;
		ignore?: Record<string, string>;
	};
};

export function defineShots<Page>(config: ShotsConfig<Page>): ShotsConfig<Page> {
	return config;
}
