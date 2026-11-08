import { useRouter } from "@tanstack/react-router";
import { useContinueReading } from "../hooks/use-continue-reading";
import { type Command, useRegisterCommands } from "./registry";
import { createFlag, createRequest } from "./signal";

export const paletteOpen = createFlag();
export const shortcutSheetOpen = createFlag();

/** Answered by the library page, which owns the import sheet. */
export const importRequest = createRequest();

export function useGlobalCommands(): void {
	const router = useRouter();
	const go = (to: string) => router.history.push(to);
	const continueReading = useContinueReading();
	const commands: Command[] = [
		{
			id: "global.palette",
			title: "Command palette",
			scope: "global",
			keys: ["Mod+K"],
			inControls: true,
			claimsKeys: true,
			isHiddenInPalette: true,
			run: () => paletteOpen.set(true),
		},
		{
			id: "global.shortcuts",
			title: "Keyboard shortcuts",
			keywords: ["keys", "help", "hotkeys"],
			scope: "global",
			keys: ["?"],
			run: () => shortcutSheetOpen.set(true),
		},
		{
			id: "global.import",
			title: "Add book",
			keywords: ["import", "file", "epub", "open"],
			scope: "global",
			keys: ["Mod+O"],
			inControls: true,
			claimsKeys: true,
			run: () => {
				importRequest.raise();
				if (router.state.location.pathname !== "/tabs/library") go("/tabs/library");
			},
		},
		...(continueReading
			? [
					{
						id: "global.continue",
						title: `Continue ${continueReading.book.title}`,
						keywords: ["resume", "last book", "read"],
						scope: "global",
						isDestination: true,
						when: () =>
							router.state.location.pathname !==
							`/tabs/reader/${encodeURIComponent(continueReading.book.id)}`,
						run: continueReading.open,
					} satisfies Command,
				]
			: []),
		{
			id: "global.library",
			title: "Go to library",
			isDestination: true,
			scope: "global",
			run: () => go("/tabs/library"),
		},
		{
			id: "global.explore",
			title: "Go to explore",
			isDestination: true,
			scope: "global",
			run: () => go("/tabs/explore"),
		},
		{
			id: "global.stats",
			title: "Go to reading stats",
			isDestination: true,
			keywords: ["statistics"],
			scope: "global",
			run: () => go("/tabs/stats"),
		},
		{
			id: "global.settings",
			title: "Open settings",
			isDestination: true,
			keywords: ["preferences"],
			scope: "global",
			run: () => go("/tabs/settings"),
		},
	];
	useRegisterCommands(commands);
}
