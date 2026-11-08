import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flush, type Rendered, render } from "../../../test/render";

const deleteAccount = vi.hoisted(() => vi.fn<(password: string) => Promise<void>>());
const deleteLibrary = vi.hoisted(() => vi.fn(async () => {}));
const logout = vi.hoisted(() => vi.fn(async () => {}));
const showToast = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/sync-context", () => ({ useSyncContext: () => ({ logout }) }));
vi.mock("@/components/toast", () => ({ useToast: () => ({ showToast }) }));
vi.mock("@/services/db/hooks", () => ({
	queryHooks: { useDeleteLibrary: () => ({ mutateAsync: deleteLibrary }) },
}));
vi.mock("@/services/sync", async () => {
	const { DELETE_ACCOUNT_REFUSAL_MESSAGES } = await import("@lesefluss/core");
	class AccountDeletionRefusedError extends Error {
		constructor(readonly reason: keyof typeof DELETE_ACCOUNT_REFUSAL_MESSAGES) {
			super(DELETE_ACCOUNT_REFUSAL_MESSAGES[reason]);
		}
	}
	return { deleteAccount, AccountDeletionRefusedError, IS_WEB_BUILD: false };
});

const { AccountDeletionRefusedError } = await import("@/services/sync");

const { DeleteAccountRow } = await import("../delete-account");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	deleteAccount.mockReset();
	deleteLibrary.mockReset();
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

const dialogInput = (selector: string) => {
	const field = document.body.querySelector<HTMLInputElement>(`[role=alertdialog] ${selector}`);
	if (!field) throw new Error(`No dialog input ${selector}`);
	return field;
};

async function typeInto(field: HTMLInputElement, value: string) {
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

const typeConfirm = (value: string) => typeInto(dialogInput("input:not([type])"), value);
const typePassword = (value: string) => typeInto(dialogInput("input[type=password]"), value);

async function submit({ password = "hunter22", alsoDeleteBooks = false } = {}) {
	await typeConfirm("DELETE");
	await typePassword(password);
	if (alsoDeleteBooks) await act(async () => dialogInput("input[type=checkbox]").click());
	await act(async () => dialogButton("Delete account").click());
	await flush();
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

	it("asks for the current password in a password field", async () => {
		await openDialog();
		const field = dialogInput("input[type=password]");
		expect(field.autocomplete).toBe("current-password");
		const label = document.body.querySelector(`label[for="${field.id}"]`);
		expect(label?.textContent).toBe("Password");
	});

	it("sends the typed password, deletes the account, then signs this device out", async () => {
		deleteAccount.mockResolvedValue();
		await openDialog();
		await submit({ password: "hunter22" });

		expect(deleteAccount).toHaveBeenCalledExactlyOnceWith("hunter22");
		expect(logout).toHaveBeenCalledOnce();
		expect(deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
			logout.mock.invocationCallOrder[0] ?? 0,
		);
		expect(showToast).toHaveBeenCalledWith("Your account was deleted", "success");
	});

	it("keeps the books on this device when the checkbox is left unchecked", async () => {
		deleteAccount.mockResolvedValue();
		await openDialog();
		expect(dialogInput("input[type=checkbox]").checked).toBe(false);
		await submit();

		expect(deleteAccount).toHaveBeenCalledOnce();
		expect(deleteLibrary).not.toHaveBeenCalled();
	});

	it("deletes the books on this device after the account when the checkbox is checked", async () => {
		deleteAccount.mockResolvedValue();
		await openDialog();
		await submit({ alsoDeleteBooks: true });

		expect(deleteLibrary).toHaveBeenCalledOnce();
		expect(deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
			deleteLibrary.mock.invocationCallOrder[0] ?? 0,
		);
		expect(showToast).toHaveBeenCalledWith("Your account was deleted", "success");
	});

	it("deletes no books when the server refuses, even with the checkbox checked", async () => {
		deleteAccount.mockRejectedValue(new AccountDeletionRefusedError("wrong_password"));
		await openDialog();
		await submit({ password: "wrong", alsoDeleteBooks: true });

		expect(deleteLibrary).not.toHaveBeenCalled();
		expect(logout).not.toHaveBeenCalled();
	});

	it("shows the server's refusal and keeps the dialog open", async () => {
		deleteAccount.mockRejectedValue(new AccountDeletionRefusedError("wrong_password"));
		await openDialog();
		await submit({ password: "wrong" });

		expect(document.body.textContent).toContain("That password is not correct.");
		expect(logout).not.toHaveBeenCalled();
		expect(dialogButton("Delete account").disabled).toBe(false);
	});

	it("says the books stayed when deleting them fails after the account is gone", async () => {
		deleteAccount.mockResolvedValue();
		deleteLibrary.mockRejectedValue(new Error("disk"));
		await openDialog();
		await submit({ alsoDeleteBooks: true });

		expect(logout).toHaveBeenCalledOnce();
		expect(showToast).toHaveBeenCalledWith(
			"Your account was deleted, but the books on this device were not",
			"danger",
		);
	});

	it("keeps the session and shows a connection error when the request fails", async () => {
		deleteAccount.mockRejectedValue(new Error("500"));
		await openDialog();
		await submit();

		expect(logout).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Couldn't delete your account");
		expect(dialogButton("Delete account").disabled).toBe(false);
	});
});
