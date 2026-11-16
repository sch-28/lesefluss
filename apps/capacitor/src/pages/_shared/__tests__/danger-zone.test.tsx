import { Button } from "@lesefluss/ui/button";
import { Trash2 } from "lucide-react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { type Rendered, render } from "../../../test/render";
import { DangerRow, DangerZone } from "../danger-zone";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("DangerZone", () => {
	it("names itself as a region and lists its rows as buttons", async () => {
		const onDelete = vi.fn();
		view = await render(
			<DangerZone>
				<DangerRow icon={Trash2} subtitle="Gone for good" onClick={onDelete}>
					Delete book
				</DangerRow>
			</DangerZone>,
		);
		const region = view.container.querySelector("section");
		const heading = region?.querySelector(
			`#${CSS.escape(region.getAttribute("aria-labelledby") ?? "")}`,
		);
		expect(heading?.textContent).toBe("Danger zone");
		const row = view.getButton(/Delete book/);
		expect(row.textContent).toContain("Gone for good");
		await act(async () => row.click());
		expect(onDelete).toHaveBeenCalledOnce();
	});

	it("a disabled row does not run its action", async () => {
		const onLeave = vi.fn();
		view = await render(
			<DangerZone>
				<DangerRow icon={Trash2} disabled onClick={onLeave}>
					Leave
				</DangerRow>
			</DangerZone>,
		);
		const row = view.getButton("Leave");
		expect(row.disabled).toBe(true);
		await act(async () => row.click());
		expect(onLeave).not.toHaveBeenCalled();
	});

	it("collapsible, hides its rows until the title is opened", async () => {
		view = await render(
			<DangerZone collapsible title="Delete local data" description="Cannot be undone.">
				<DangerRow icon={Trash2} onClick={() => {}}>
					Delete everything
				</DangerRow>
			</DangerZone>,
		);
		expect(view.text()).not.toContain("Delete everything");
		await act(async () => view?.getButton("Delete local data").click());
		expect(view.text()).toContain("Cannot be undone.");
		expect(view.getButton(/Delete everything/)).toBeTruthy();
	});
});

describe("destructive style", () => {
	it("is the one destructive Button variant, on Button and on a dialog's confirm", async () => {
		view = await render(
			<>
				<Button variant="destructive">Delete</Button>
				<ConfirmDialog
					open
					onOpenChange={() => {}}
					title="Delete?"
					confirmLabel="Remove"
					destructive
				/>
			</>,
		);
		const buttonClass = view.getButton("Delete").className;
		const confirm = [...document.querySelectorAll<HTMLElement>("button")].find(
			(b) => b.textContent === "Remove",
		);
		expect(buttonClass).toContain("bg-destructive text-destructive-foreground");
		expect(confirm?.className).toContain("bg-destructive text-destructive-foreground");
	});
});
