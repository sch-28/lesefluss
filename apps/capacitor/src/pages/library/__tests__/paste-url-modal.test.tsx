import type React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

vi.mock("../../../components/entry-dialog", () => ({
	EntryDialog: (p: { open: boolean; children?: React.ReactNode }) =>
		p.open ? <div>{p.children}</div> : null,
}));

const { default: PasteUrlModal, isImportableUrl } = await import("../paste-url-modal");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("PasteUrlModal", () => {
	it("shows a failed import under the field and clears it once the link is edited", async () => {
		const onClearError = vi.fn();
		view = await render(
			<PasteUrlModal
				isOpen
				isImporting={false}
				error="Couldn't load this page."
				onClearError={onClearError}
				onClose={() => {}}
				onSubmit={() => {}}
			/>,
		);
		const alert = view.container.querySelector("[data-testid=url-import-error]");
		expect(alert?.getAttribute("role")).toBe("alert");
		expect(alert?.textContent).toBe("Couldn't load this page.");
		const input = view.container.querySelector("input") as HTMLInputElement;
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(input.getAttribute("aria-describedby")).toBe(alert?.id);

		const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		act(() => {
			setValue?.call(input, "https://example.com");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(onClearError).toHaveBeenCalled();
	});

	it("keeps Import disabled for a word that is no web address", async () => {
		view = await render(
			<PasteUrlModal
				isOpen
				isImporting={false}
				error={null}
				onClearError={() => {}}
				onClose={() => {}}
				onSubmit={() => {}}
			/>,
		);
		const input = view.container.querySelector("input") as HTMLInputElement;
		const importButton = () =>
			[...(view?.container.querySelectorAll("button") ?? [])].find(
				(b) => b.textContent === "Import",
			) as HTMLButtonElement;
		const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		act(() => {
			setValue?.call(input, "hello");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(importButton().disabled).toBe(true);
		act(() => {
			setValue?.call(input, "example.com/story");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(importButton().disabled).toBe(false);
	});

	it("enables Import only for a web address with a dotted host", () => {
		expect(isImportableUrl("hello")).toBe(false);
		expect(isImportableUrl("not a url")).toBe(false);
		expect(isImportableUrl("example.com/story")).toBe(true);
		expect(isImportableUrl("https://archiveofourown.org/works/1")).toBe(true);
	});
});
