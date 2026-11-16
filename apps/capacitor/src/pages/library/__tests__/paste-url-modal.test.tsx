import type React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

vi.mock("../../../components/entry-dialog", () => ({
	EntryDialog: (p: { open: boolean; children?: React.ReactNode }) =>
		p.open ? <div>{p.children}</div> : null,
}));

const { default: PasteUrlModal } = await import("../paste-url-modal");

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
});
