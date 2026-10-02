import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Tells React this environment flushes effects inside act(); without it every
// update logs a "not wrapped in act" warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export type Rendered = {
	container: HTMLElement;
	queryClient: QueryClient;
	unmount: () => void;
	rerender: (ui: React.ReactElement) => Promise<void>;
	/** Visible text, whitespace-collapsed. */
	text: () => string;
	getButton: (name: string | RegExp) => HTMLButtonElement;
	queryButton: (name: string | RegExp) => HTMLButtonElement | null;
};

function matches(el: Element, name: string | RegExp): boolean {
	const label = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
	return typeof name === "string" ? label === name : name.test(label);
}

/**
 * Minimal render for component tests, without pulling in a testing library.
 * Each render gets its own QueryClient with retries off, so a failing query
 * settles straight into its error state.
 */
export async function render(ui: React.ReactElement): Promise<Rendered> {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	let root: Root | undefined;
	await act(async () => {
		root = createRoot(container);
		root.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
	});

	const queryButton = (name: string | RegExp) =>
		[...container.querySelectorAll("button")].find((b) => matches(b, name)) ?? null;

	return {
		container,
		queryClient,
		rerender: async (next) => {
			await act(async () => {
				root?.render(<QueryClientProvider client={queryClient}>{next}</QueryClientProvider>);
			});
		},
		unmount: () => {
			act(() => root?.unmount());
			container.remove();
			queryClient.clear();
		},
		text: () => (container.textContent ?? "").replace(/\s+/g, " ").trim(),
		queryButton,
		getButton: (name) => {
			const button = queryButton(name);
			if (!button) throw new Error(`No button named ${String(name)}`);
			return button;
		},
	};
}

/** Let pending promises and the React updates they trigger settle. */
export async function flush(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

export async function click(el: HTMLElement): Promise<void> {
	await act(async () => {
		el.click();
	});
	await flush();
}

export function setOnline(online: boolean): void {
	Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
	act(() => {
		window.dispatchEvent(new Event(online ? "online" : "offline"));
	});
}
