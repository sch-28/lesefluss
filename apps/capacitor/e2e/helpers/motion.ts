import type { Page } from "@playwright/test";

/**
 * Elements that still transition or animate, and animations still running.
 * `allowSpinners`: under OS reduce motion a spinner (.animate-spin) keeps
 * turning on purpose; e-ink stops it too.
 */
export function elementsInMotion(
	page: Page,
	{ allowSpinners = false }: { allowSpinners?: boolean } = {},
): Promise<string[]> {
	return page.evaluate((allowSpinners) => {
		const isSpinner = (el: Element | null) => allowSpinners && !!el?.closest(".animate-spin");
		const offenders: string[] = [];
		for (const el of document.querySelectorAll("*")) {
			if (isSpinner(el)) continue;
			const style = getComputedStyle(el);
			const what = `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)}`;
			if (style.transitionDuration.split(",").some((d) => Number.parseFloat(d) > 0)) {
				offenders.push(`${what}: transition ${style.transitionDuration}`);
			}
			if (style.animationName !== "none") offenders.push(`${what}: animation`);
		}
		const running = document
			.getAnimations()
			.filter((a) => !isSpinner((a.effect as KeyframeEffect | null)?.target ?? null)).length;
		if (running > 0) offenders.push(`${running} running animation(s)`);
		return offenders;
	}, allowSpinners);
}
