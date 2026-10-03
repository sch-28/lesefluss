import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flush, type Rendered, render } from "../../../test/render";

const signInWithPassword = vi.hoisted(() =>
	vi.fn<(email: string, password: string) => Promise<void>>(),
);
const openBrowserSignIn = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/contexts/sync-context", () => ({
	useSyncContext: () => ({ signInWithPassword }),
}));

vi.mock("@/services/sync", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/services/sync")>();
	return {
		...actual,
		NATIVE_SYNC_ENABLED: true,
		openBrowserSignIn,
	};
});

const { PasswordSignInForm } = await import("../password-sign-in-form");
const { PasswordSignInError } = await import("@/services/sync");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	signInWithPassword.mockReset();
	openBrowserSignIn.mockClear();
});

function input(label: string): HTMLInputElement {
	const el = [...(view?.container.querySelectorAll("label") ?? [])].find(
		(l) => l.textContent === label,
	);
	const id = el?.getAttribute("for");
	const field = id ? view?.container.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`) : null;
	if (!field) throw new Error(`No input labelled ${label}`);
	return field;
}

async function type(field: HTMLInputElement, value: string) {
	await act(async () => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(field, value);
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

async function submit() {
	await act(async () => {
		view?.container.querySelector("form")?.requestSubmit();
	});
	await flush();
}

describe("PasswordSignInForm", () => {
	it("keeps submit disabled until both fields are filled", async () => {
		view = await render(<PasswordSignInForm />);
		expect(view.getButton("Sign in").disabled).toBe(true);

		await type(input("Email"), "reader@example.com");
		expect(view.getButton("Sign in").disabled).toBe(true);

		await type(input("Password"), "hunter22");
		expect(view.getButton("Sign in").disabled).toBe(false);
	});

	it("signs in with trimmed email and clears the password afterwards", async () => {
		let resolve!: () => void;
		signInWithPassword.mockReturnValue(
			new Promise<void>((r) => {
				resolve = r;
			}),
		);
		view = await render(<PasswordSignInForm />);
		await type(input("Email"), "  reader@example.com ");
		await type(input("Password"), "hunter22");
		await submit();

		expect(signInWithPassword).toHaveBeenCalledWith("reader@example.com", "hunter22");
		expect(view.getButton("Signing in…").disabled).toBe(true);
		expect(input("Password").value).toBe("hunter22");

		await act(async () => resolve());
		await flush();
		expect(input("Password").value).toBe("");
	});

	it("shows the failure message inline and lets the user retry", async () => {
		signInWithPassword.mockRejectedValueOnce(new PasswordSignInError("email-not-verified"));
		view = await render(<PasswordSignInForm />);
		await type(input("Email"), "reader@example.com");
		await type(input("Password"), "hunter22");
		await submit();

		expect(view.text()).toContain("Your email is not verified yet");
		expect(view.getButton("Sign in").disabled).toBe(false);

		await type(input("Password"), "hunter23");
		expect(view.text()).not.toContain("Your email is not verified yet");
	});

	it("tells the user when no browser could be opened", async () => {
		openBrowserSignIn.mockRejectedValueOnce(new Error("No Activity found"));
		view = await render(<PasswordSignInForm />);

		await act(async () => {
			view?.getButton("Sign in in your browser").click();
		});
		await flush();

		expect(view.text()).toContain("Couldn't open a browser on this device.");
		expect(view.getButton("Sign in in your browser").disabled).toBe(false);
	});

	it("runs the pre-hook before opening the browser sign-in", async () => {
		const calls: string[] = [];
		const beforeBrowserSignIn = vi.fn(async () => {
			calls.push("before");
		});
		openBrowserSignIn.mockImplementation(async () => {
			calls.push("open");
		});
		view = await render(<PasswordSignInForm beforeBrowserSignIn={beforeBrowserSignIn} />);

		await act(async () => {
			view?.getButton("Sign in in your browser").click();
		});
		await flush();

		expect(calls).toEqual(["before", "open"]);
	});
});
