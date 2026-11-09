import type React from "react";
import { act, Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";

const HOUR = 3_600_000;
const mutate = vi.fn();
const state: {
	settings: Record<string, unknown>;
	saving: { isPending: boolean; variables?: { speedWindow?: string } };
	model: unknown;
	books: unknown[];
	plans: unknown[];
} = { settings: {}, saving: { isPending: false }, model: undefined, books: [], plans: [] };

vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<object>()),
	createFileRoute: () => (options: unknown) => ({ options }),
	useNavigate: () => vi.fn(),
	Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));
vi.mock("@/components/app-shell/page-header", () => ({
	PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/app-shell/tab-header", () => ({
	TabHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/ble-indicator", () => ({ default: () => null }));
vi.mock("@/contexts/ble-context", () => ({
	useBLE: () => ({ connectionState: 0, connectedDevice: null }),
}));
vi.mock("@/contexts/sync-context", () => ({
	useSyncContext: () => ({ isLoggedIn: false, userEmail: null }),
}));
vi.mock("@/contexts/theme-context", () => ({
	useTheme: () => ({ theme: "dark" }),
	focalLetterColorFor: () => "#ff0000",
}));
vi.mock("../../../contexts/theme-context", () => ({
	useTheme: () => ({ theme: "dark" }),
	focalLetterColorFor: () => "#ff0000",
}));
const updateSetting = vi.fn();
vi.mock("@/hooks/use-auto-save-settings", () => ({
	useAutoSaveSettings: () => ({ settings: state.settings, updateSetting, isPending: false }),
}));
vi.mock("../../../hooks/use-auto-save-settings", () => ({
	useAutoSaveSettings: () => ({
		settings: state.settings,
		updateSetting,
		replaceAll: vi.fn(),
		isPending: false,
	}),
}));
vi.mock("@/services/tts", () => ({
	HAS_SYSTEM_VOICE_SETTINGS: false,
	IS_READ_ALOUD_SUPPORTED: false,
	ttsEngine: {},
}));
vi.mock("@/services/tts/use-voices", () => ({ useTtsVoices: () => ({ data: [] }) }));
vi.mock("@/components/read-aloud/voice-sheet", () => ({ VoiceSheet: () => null }));
vi.mock("@/hooks/use-appearance-settings", async (importOriginal) => ({
	...(await importOriginal<object>()),
	useAppearanceSettings: () => ({ paginationStyle: "scroll" }),
}));
vi.mock("@/services/telemetry", () => ({
	getDeviceDiagnostics: () => Promise.resolve(null),
	isTelemetryEnabled: () => true,
	setTelemetryEnabled: vi.fn(),
}));
vi.mock("@/hooks/use-continue-reading", () => ({
	useContinueReading: () => (state.books[0] ? { book: state.books[0], open: vi.fn() } : null),
}));
vi.mock("@/pages/library/reading-goal/goal-sheet-for", () => ({
	GoalSheetFor: ({ book }: { book: { title: string } }) => (
		<div data-testid="goal-sheet">{book.title}</div>
	),
	GoalEditSheet: () => null,
}));
vi.mock("@/services/db/hooks", () => ({
	queryHooks: {
		useSettings: () => ({ data: state.settings, isPending: false }),
		useSaveSettings: () => ({ mutate, ...state.saving }),
		useStatsSpeedModel: () => ({ data: state.model }),
		useBooks: () => ({ data: { books: state.books, covers: {} } }),
		useActiveGoalPlans: () => ({ data: state.plans }),
		useBook: () => ({ data: undefined }),
	},
}));

const settingsRoot = (await import("../../../routes/tabs/settings/index")).Route as unknown as Page;
const speedPage = (await import("../../../routes/tabs/settings/speed")).Route as unknown as Page;
const goalsPage = (await import("../../../routes/tabs/settings/goals")).Route as unknown as Page;
const listenPage = (await import("../../../routes/tabs/settings/read-aloud"))
	.Route as unknown as Page;
const { default: RsvpSettingsForm } = await import("../rsvp-settings-form");

const book = (id: string, over: Record<string, unknown> = {}) => ({
	id,
	title: `Book ${id}`,
	author: null,
	seriesId: null,
	wordCount: 90_000,
	wordPosition: 9_000,
	finishedAt: null,
	...over,
});

type Page = { options: { component: React.ComponentType & { preload?: () => Promise<void> } } };

/** Route files are code-split, so the component is lazy: load it before rendering. */
async function renderPage(route: Page) {
	const Component = route.options.component;
	await act(async () => {
		await Component.preload?.();
	});
	return render(
		<Suspense fallback={null}>
			<Component />
		</Suspense>,
	);
}

let view: Rendered | undefined;
beforeEach(() => {
	mutate.mockClear();
	state.settings = {
		speedWindow: "30d",
		wpm: 300,
		delayComma: 2,
		delayPeriod: 3,
		focalLetterColor: "#FF0000",
		accelStart: 2,
		accelRate: 0.1,
		xOffset: 30,
		wordOffset: 5,
	};
	state.saving = { isPending: false };
	state.model = undefined;
	state.books = [];
	state.plans = [];
});
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const link = (href: string) =>
	view?.container.querySelector<HTMLAnchorElement>(`a[href="${href}"]`) ?? null;

describe("Settings root", () => {
	it("opens the speed window and diagnostics from rows with an icon, like every other setting", async () => {
		view = await renderPage(settingsRoot);
		const speed = link("/tabs/settings/speed");
		expect(speed?.textContent).toContain("Speed & estimates");
		expect(speed?.textContent).toContain("30 days");
		expect(speed?.querySelector("svg")).not.toBeNull();
		const diagnostics = link("/tabs/settings/diagnostics");
		expect(diagnostics?.textContent).toContain("Anonymous diagnostics");
		expect(diagnostics?.textContent).toContain("On");
		expect(diagnostics?.querySelector("svg")).not.toBeNull();
		expect(view.container.querySelector("[role=switch]")).toBeNull();
		expect(view.container.querySelector("[data-testid=speed-window-select]")).toBeNull();
	});
});

describe("Speed & estimates page", () => {
	it("saves the window the reader taps and leaves the current one alone", async () => {
		view = await renderPage(speedPage);
		const radios = [...view.container.querySelectorAll<HTMLElement>("[role=radio]")];
		expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
		await click(radios[1] as HTMLElement);
		expect(mutate).not.toHaveBeenCalled();
		await click(radios[2] as HTMLElement);
		expect(mutate).toHaveBeenCalledWith({ speedWindow: "all" });
	});

	it("checks the tapped window while its save is still on the way", async () => {
		state.saving = { isPending: true, variables: { speedWindow: "all" } };
		view = await renderPage(speedPage);
		const checked = view.container.querySelector("[role=radio][aria-checked=true]");
		expect(checked?.id).toBe("speed-window-all");
	});

	it("previews the speed and the current book's time left with the window", async () => {
		state.model = {
			window: "30d",
			reading: { wpm: 300, source: "measured", activeMs: 5 * HOUR },
			rsvp: null,
			pace: { wpm: 300, source: "measured" },
			books: {},
		};
		state.books = [book("a")];
		view = await renderPage(speedPage);
		const preview = view.container.querySelector("[data-testid=speed-preview]");
		expect(preview?.textContent).toContain("300 wpm");
		// 81,000 words left at 300 wpm.
		expect(preview?.textContent).toContain("Book a4h 30m left");
		expect(preview?.textContent).toContain("5h of reading");
	});

	it("holds the preview's place while the speed loads", async () => {
		view = await renderPage(speedPage);
		expect(view.container.querySelector("[data-testid=reserved-card]")).not.toBeNull();
	});
});

describe("Goals page", () => {
	it("adds a goal for a book picked from the ones that can still take one", async () => {
		state.books = [
			book("a"),
			book("b", { wordPosition: 90_000 }),
			book("c"),
			book("d", { wordCount: 0 }),
		];
		state.plans = [{ goal: { id: "g1", bookId: "c" }, plan: { kind: "plan", isComplete: true } }];
		view = await renderPage(goalsPage);
		await click(view.container.querySelector("[data-testid=add-goal]") as HTMLElement);
		const candidates = [...document.querySelectorAll("[data-testid=goal-candidate]")];
		expect(candidates.map((c) => c.textContent)).toEqual(["Book a"]);
		await click(candidates[0] as HTMLElement);
		expect(view.container.querySelector("[data-testid=goal-sheet]")?.textContent).toBe("Book a");
	});

	it("offers Add goal with no goal set yet", async () => {
		view = await renderPage(goalsPage);
		expect(view.text()).toContain("No active goals.");
		expect(view.container.querySelector("[data-testid=add-goal]")).not.toBeNull();
	});
});

describe("Speed controls", () => {
	const speedRow = () => view?.container.querySelector("[data-testid=speed-row]") ?? null;

	it("sets the RSVP speed and the Listen speed with the same control", async () => {
		state.settings = { ...state.settings, wpm: 300, ttsWpm: 180 };
		view = await render(<RsvpSettingsForm />);
		const rsvp = speedRow();
		expect(rsvp?.querySelector("[data-testid=rsvp-wpm-value]")?.textContent).toBe("300");
		const rsvpButtons = [...(rsvp?.querySelectorAll("button") ?? [])].map((b) =>
			b.getAttribute("aria-label"),
		);
		view.unmount();

		view = await renderPage(listenPage);
		const listen = speedRow();
		expect(listen?.querySelector("[data-testid=rsvp-wpm-value]")?.textContent).toBe("180");
		expect(
			[...(listen?.querySelectorAll("button") ?? [])].map((b) => b.getAttribute("aria-label")),
		).toEqual(rsvpButtons);
		await click(listen?.querySelector("button:last-of-type") as HTMLElement);
		expect(updateSetting).toHaveBeenCalledWith("ttsWpm", 190);
	});
});
