import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { click, render } from "../../../test/render";

vi.mock(
	"@lesefluss/ui/drawer",
	async () => (await import("../../../test/overlay-mocks")).drawerModule,
);

const { CommentTargetPicker } = await import("../comment-target-picker");

const OPTIONS = [
	{ value: "position", label: "At my current position" },
	{ value: "c1", label: 'About the chapter "One"' },
];

describe("CommentTargetPicker", () => {
	it("shows the pick in a picker field and changes it from the sheet", async () => {
		function Harness() {
			const [value, setValue] = useState("position");
			return <CommentTargetPicker value={value} options={OPTIONS} onChange={setValue} />;
		}
		const view = await render(<Harness />);
		const trigger = view.getButton("What the comment is about");
		expect(trigger.textContent).toContain("At my current position");
		expect(view.container.querySelector("select")).toBeNull();
		await click(trigger);
		const chapter = [...document.body.querySelectorAll("button")].find((b) =>
			b.textContent?.includes("One"),
		) as HTMLElement;
		await click(chapter);
		expect(view.getButton("What the comment is about").textContent).toContain(
			'About the chapter "One"',
		);
		view.unmount();
	});
});
