import type React from "react";
import { act, Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, flush, type Rendered, render } from "../../../test/render";

const logout = vi.hoisted(() => vi.fn(async () => {}));
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<object>()),
	createFileRoute: () => (options: unknown) => ({ options }),
	useNavigate: () => vi.fn(),
}));
vi.mock("@/components/app-shell/page-header", () => ({
	PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/sync/cloud-storage", () => ({ CloudStorageSection: () => null }));
vi.mock("@/components/sync/danger-zone", () => ({ DangerZone: () => null }));
vi.mock("@/components/sync/delete-account", () => ({ DeleteAccountRow: () => null }));
vi.mock("@/components/sync/sign-in-panel", () => ({ SignInPanel: () => null }));
vi.mock("@/components/toast", () => ({ toast: { success: toastSuccess } }));
vi.mock("@/services/sync", () => ({ IS_WEB_BUILD: false }));
vi.mock("@/contexts/sync-context", () => ({
	useSyncContext: () => ({
		isLoggedIn: true,
		userEmail: "reader@example.com",
		isSyncing: false,
		lastSynced: null,
		syncError: null,
		logout,
		syncNow: vi.fn(),
	}),
}));
vi.mock("@/services/db/hooks", () => ({
	queryHooks: {
		useSettings: () => ({ data: {} }),
		useSaveSettings: () => ({ mutate: vi.fn() }),
	},
}));

const { Route } = await import("../../../routes/tabs/settings/sync");

type Page = { options: { component: React.ComponentType & { preload?: () => Promise<void> } } };

async function renderSync() {
	const Component = (Route as unknown as Page).options.component;
	await act(async () => {
		await Component.preload?.();
	});
	return render(
		<Suspense fallback={null}>
			<Component />
		</Suspense>,
	);
}

const button = (name: string) =>
	[...document.querySelectorAll<HTMLElement>("button")].find(
		(b) => b.textContent?.trim().startsWith(name) ?? false,
	);

let view: Rendered | undefined;
beforeEach(() => {
	logout.mockClear();
	toastSuccess.mockClear();
});
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("Sign out", () => {
	it("asks first and signs out only once confirmed, then says the books stay", async () => {
		view = await renderSync();
		const row = button("Sign out");
		if (!row) throw new Error("No Sign out row");
		await click(row);
		expect(document.querySelector("[role=alertdialog], [role=dialog]")?.textContent).toContain(
			"Sign out?",
		);
		expect(logout).not.toHaveBeenCalled();

		const dialog = document.querySelector<HTMLElement>("[role=alertdialog], [role=dialog]");
		const confirm = [...(dialog?.querySelectorAll<HTMLElement>("button") ?? [])].find(
			(b) => b.textContent?.trim() === "Sign out",
		);
		if (!confirm) throw new Error("No confirm button");
		await click(confirm);
		await flush();
		expect(logout).toHaveBeenCalledTimes(1);
		expect(toastSuccess).toHaveBeenCalledWith("Signed out. Your books stay on this device.");
	});

	it("stays signed in when the question is cancelled", async () => {
		view = await renderSync();
		const row = button("Sign out");
		if (!row) throw new Error("No Sign out row");
		await click(row);
		const dialog = document.querySelector<HTMLElement>("[role=alertdialog], [role=dialog]");
		const cancel = [...(dialog?.querySelectorAll<HTMLElement>("button") ?? [])].find(
			(b) => b.textContent?.trim() === "Cancel",
		);
		if (!cancel) throw new Error("No cancel button");
		await click(cancel);
		await flush();
		expect(logout).not.toHaveBeenCalled();
		expect(toastSuccess).not.toHaveBeenCalled();
	});
});
