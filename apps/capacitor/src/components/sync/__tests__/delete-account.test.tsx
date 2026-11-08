import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flush, type Rendered, render } from "../../../test/render";

const deleteAccount = vi.hoisted(() => vi.fn<() => Promise<void>>());
const logout = vi.hoisted(() => vi.fn(async () => {}));
const showToast = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/sync-context", () => ({ useSyncContext: () => ({ logout }) }));
vi.mock("@/components/toast", () => ({ useToast: () => ({ showToast }) }));
vi.mock("@/services/sync", () => ({ deleteAccount, IS_WEB_BUILD: false }));

const { DeleteAccountRow } = await import("../delete-account");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	deleteAccount.mockReset();
	logout.mockClear();
	showToast.mockClear();
});

const dialogButton = (name: string) => {
	const button = [...document.body.querySelectorAll("button")].find(
		(b) => b.textContent?.trim() === name && b.closest("[role=alertdialog]"),
	);
	if (!button) throw new Error(`No dialog button ${name}`);
	return button;
};

async function typeConfirm(value: string) {
	const field = document.body.querySelector<HTMLInputElement>("[role=alertdialog] input");
	if (!field) throw new Error("No confirm input");
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

async function openDialog() {
	view = await render(<DeleteAccountRow />);
	await act(async () => {
		view?.getButton(/^Delete account/).click();
	});
}

describe("DeleteAccountRow", () => {
	it("enables the delete only once DELETE is typed", async () => {
		await openDialog();
		expect(dialogButton("Delete account").disabled).toBe(true);
		await typeConfirm("delete");
		expect(dialogButton("Delete account").disabled).toBe(true);
		await typeConfirm("DELETE");
		expect(dialogButton("Delete account").disabled).toBe(false);
		expect(deleteAccount).not.toHaveBeenCalled();
	});

	it("deletes the account, then signs this device out", async () => {
		deleteAccount.mockResolvedValue();
		await openDialog();
		await typeConfirm("DELETE");
		await act(async () => dialogButton("Delete account").click());
		await flush();

		expect(deleteAccount).toHaveBeenCalledOnce();
		expect(logout).toHaveBeenCalledOnce();
		expect(deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
			logout.mock.invocationCallOrder[0] ?? 0,
		);
		expect(showToast).toHaveBeenCalledWith("Your account was deleted", "success");
	});

	it("keeps the session and shows an error when the server refuses", async () => {
		deleteAccount.mockRejectedValue(new Error("500"));
		await openDialog();
		await typeConfirm("DELETE");
		await act(async () => dialogButton("Delete account").click());
		await flush();

		expect(logout).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Couldn't delete your account");
		expect(dialogButton("Delete account").disabled).toBe(false);
	});
});
