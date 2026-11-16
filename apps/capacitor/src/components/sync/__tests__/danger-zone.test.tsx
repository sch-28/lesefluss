import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const mutation = vi.hoisted(() => () => ({ mutate: vi.fn() }));
vi.mock("@/components/toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/services/db/hooks", () => ({
	queryHooks: {
		useDeleteAllHighlights: mutation,
		useDeleteAllGlossary: mutation,
		useDeleteAllReadingSessions: mutation,
		useDeleteLibrary: mutation,
		useDeleteEverything: mutation,
	},
}));

const { DangerZone } = await import("../danger-zone");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

async function openEverything(isSynced: boolean) {
	view = await render(<DangerZone isSynced={isSynced} />);
	await act(async () => {
		view?.getButton(isSynced ? "Danger zone" : "Delete local data").click();
	});
	await act(async () => {
		view?.getButton(/^Delete everything/).click();
	});
	return document.body.querySelector("[role=alertdialog]")?.textContent ?? "";
}

describe("DangerZone", () => {
	it("signed out, deletes only this device's data and says so", async () => {
		const dialog = await openEverything(false);
		expect(view?.text()).toContain("Permanently delete data stored on this device");
		expect(dialog).toContain("from this device.");
		expect(dialog).not.toContain("cloud account");
	});

	it("signed in, warns that the deletion reaches the cloud account", async () => {
		const dialog = await openEverything(true);
		expect(dialog).toContain("from your cloud account");
	});
});
