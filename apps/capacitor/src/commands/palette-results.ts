import { bestScore } from "./fuzzy";
import type { Command } from "./registry";
import { SCOPE_LABELS, SCOPE_ORDER } from "./scopes";

export const MAX_PALETTE_RESULTS = 50;

export type PaletteGroup = { label: string; commands: Command[] };

export const DESTINATIONS_LABEL = "Go to";

/**
 * The palette's rows: grouped by scope label, groups in SCOPE_ORDER, best match
 * first within a group. With an empty query, registration order, led by the
 * destinations.
 */
export function paletteGroups(commands: readonly Command[], query: string): PaletteGroup[] {
	const isSearching = query.trim() !== "";
	const scored: { command: Command; score: number; order: number }[] = [];
	commands.forEach((command, order) => {
		if (command.isHiddenInPalette || (command.isSearchOnly && !isSearching)) return;
		const score = bestScore(query, [command.title, ...(command.keywords ?? [])]);
		if (score !== null) scored.push({ command, score, order });
	});
	scored.sort((a, b) => b.score - a.score || a.order - b.order);
	const kept = scored.slice(0, MAX_PALETTE_RESULTS);

	const groups = new Map<string, Command[]>();
	if (!isSearching) groups.set(DESTINATIONS_LABEL, []);
	for (const scope of SCOPE_ORDER) groups.set(SCOPE_LABELS[scope], []);
	for (const { command } of kept) {
		const label =
			!isSearching && command.isDestination ? DESTINATIONS_LABEL : SCOPE_LABELS[command.scope];
		groups.get(label)?.push(command);
	}
	return [...groups]
		.filter(([, list]) => list.length > 0)
		.map(([label, list]) => ({ label, commands: list }));
}
