import { Drawer, DrawerContent, DrawerTitle, drawerSnapPoints } from "@lesefluss/ui/drawer";
import { afterEach, describe, expect, it } from "vitest";
import { flush, type Rendered, render } from "../../test/render";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	document.body.innerHTML = "";
});

const SNAPS = drawerSnapPoints([0.5, 1]);
const overlay = () => document.querySelector<HTMLElement>('[data-slot="drawer-overlay"]');

describe("Drawer overlay", () => {
	it("dims a snap drawer already at its first snap point", async () => {
		view = await render(
			<Drawer open snapPoints={SNAPS} activeSnapPoint={SNAPS[0]} setActiveSnapPoint={() => {}}>
				<DrawerContent>
					<DrawerTitle>Sheet</DrawerTitle>
				</DrawerContent>
			</Drawer>,
		);
		await flush();
		expect(overlay()?.getAttribute("data-vaul-snap-points-overlay")).toBe("true");
	});

	it("uses a light dim without blur, stronger on a dark page", async () => {
		view = await render(
			<Drawer open>
				<DrawerContent>
					<DrawerTitle>Sheet</DrawerTitle>
				</DrawerContent>
			</Drawer>,
		);
		await flush();
		expect(overlay()?.className).toContain("bg-black/30");
		expect(overlay()?.className).toContain("dark:bg-black/60");
		expect(overlay()?.className).not.toContain("backdrop-blur");
	});

	it("is a centered panel, not a full-width drawer, from md up", async () => {
		view = await render(
			<Drawer open>
				<DrawerContent>
					<DrawerTitle>Sheet</DrawerTitle>
				</DrawerContent>
			</Drawer>,
		);
		await flush();
		const content = document.querySelector('[data-slot="drawer-content"]')?.className ?? "";
		expect(content).toContain("md:data-[vaul-drawer-direction=bottom]:max-w-xl");
		expect(content).toContain("md:data-[vaul-drawer-direction=bottom]:mx-auto");
	});
});
