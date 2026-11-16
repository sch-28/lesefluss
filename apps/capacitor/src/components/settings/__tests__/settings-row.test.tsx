import { Volume2 } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { click, render } from "../../../test/render";
import { ExpanderRow, NavRow } from "../settings-row";
import { TextAction } from "../text-action";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));

const chevrons = (el: Element) => el.querySelectorAll("svg.lucide-chevron-right").length;

describe("settings rows", () => {
	it("draws a chevron only on rows that go somewhere", async () => {
		const play = vi.fn();
		const view = await render(
			<>
				<NavRow icon={Volume2} title="Play a sample" subtitle="Hear it" onClick={play} inPlace />
				<NavRow title="Voice" subtitle="Pick one" onClick={vi.fn()} />
			</>,
		);
		const [inPlace, nav] = [...view.container.querySelectorAll("button")];
		expect(chevrons(inPlace as Element)).toBe(0);
		expect(chevrons(nav as Element)).toBe(1);
		await click(inPlace as HTMLElement);
		expect(play).toHaveBeenCalledTimes(1);
		view.unmount();
	});

	it("expands and collapses with aria-expanded", async () => {
		function Harness() {
			const [open, setOpen] = useState(false);
			return (
				<>
					<ExpanderRow title="Advanced" open={open} onToggle={() => setOpen((o) => !o)} />
					{open && <p>details</p>}
				</>
			);
		}
		const view = await render(<Harness />);
		const row = view.getButton("Advanced");
		expect(row.getAttribute("aria-expanded")).toBe("false");
		await click(row);
		expect(row.getAttribute("aria-expanded")).toBe("true");
		expect(view.text()).toContain("details");
		view.unmount();
	});

	it("gives every text action the same shape, a link only its colour", async () => {
		const view = await render(
			<>
				<TextAction onClick={vi.fn()}>Reset spacing</TextAction>
				<TextAction onClick={vi.fn()}>Reset RSVP settings</TextAction>
				<TextAction tone="link" onClick={vi.fn()}>
					Open full RSVP settings
				</TextAction>
			</>,
		);
		const [a, b, link] = [...view.container.querySelectorAll("button")].map((x) => x.className);
		expect(a).toBe(b);
		expect(link).toContain("text-primary");
		expect(a).toContain("min-h-11");
		expect(link).toContain("min-h-11");
		view.unmount();
	});
});
