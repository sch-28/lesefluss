import type { Command } from "./registry";
import { type CommandScope, SCOPE_LABELS } from "./scopes";

/** The current mode's group (RSVP, Page and scroll, Library) leads; only one is ever active. */
const SHEET_ORDER: readonly CommandScope[] = [
	"rsvp",
	"page",
	"scroll",
	"library",
	"reader",
	"listen",
	"global",
];

export type ShortcutRow = { id: string; title: string; keys: string[] };
export type ShortcutGroup = { label: string; rows: ShortcutRow[] };

/**
 * The shortcut sheet's groups from the active commands. A key bound by two
 * active commands is listed only under the one the dispatcher runs, so every
 * listed key does what its row says.
 */
export function shortcutGroups(active: readonly Command[]): ShortcutGroup[] {
	const dispatchOrder = [
		...active.filter((c) => c.claimsKeys),
		...active.filter((c) => !c.claimsKeys),
	];
	const taken = new Set<string>();
	const rowsByScope = new Map<CommandScope, ShortcutRow[]>();
	for (const command of dispatchOrder) {
		const keys = (command.keys ?? []).filter((key) => !taken.has(key));
		if (keys.length === 0) continue;
		for (const key of keys) taken.add(key);
		const rows = rowsByScope.get(command.scope) ?? [];
		rows.push({ id: command.id, title: command.title, keys });
		rowsByScope.set(command.scope, rows);
	}

	const groups = new Map<string, ShortcutRow[]>();
	for (const scope of SHEET_ORDER) {
		const rows = rowsByScope.get(scope);
		if (!rows) continue;
		const label = SCOPE_LABELS[scope];
		groups.set(label, [...(groups.get(label) ?? []), ...rows]);
	}
	return [...groups].map(([label, rows]) => ({ label, rows }));
}
