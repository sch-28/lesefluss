import { isConditionComplete, withField } from "./condition-fields";
import {
	type Condition,
	type ConditionGroup,
	type ConditionNode,
	type ConditionTree,
	isGroup,
} from "./condition-tree";

/** The editor's working copy of a tree: every node keyed, so React keeps a row's
 *  input state while rows around it move. */
export type DraftCondition = Condition & { id: string };
export type DraftGroup = { id: string; op: string; items: DraftNode[] };
export type DraftNode = DraftCondition | DraftGroup;

/** Groups the editor nests, the shelf's own group counted. */
export const MAX_GROUP_LEVELS = 3;

let lastId = 0;
const newId = () => `node-${++lastId}`;

export function isDraftGroup(node: DraftNode): node is DraftGroup {
	return "items" in node;
}

export function toDraft(group: ConditionGroup): DraftGroup {
	const node = (n: ConditionNode): DraftNode => (isGroup(n) ? toDraft(n) : { ...n, id: newId() });
	return { id: newId(), op: group.op, items: group.items.map(node) };
}

export function fromDraft(root: DraftGroup): ConditionTree {
	const group = (g: DraftGroup): ConditionGroup => ({
		op: g.op as ConditionGroup["op"],
		items: g.items.map((n) =>
			isDraftGroup(n) ? group(n) : { field: n.field, op: n.op, value: n.value },
		),
	});
	return { v: 1, root: group(root) };
}

export function newCondition(): DraftCondition {
	return { ...withField("status"), id: newId() };
}

export function newGroup(): DraftGroup {
	return { id: newId(), op: "and", items: [newCondition()] };
}

/** Group levels in a subtree: 0 for a condition. */
function height(node: DraftNode): number {
	return isDraftGroup(node) ? 1 + Math.max(0, ...node.items.map(height)) : 0;
}

type Located = { parent: DraftGroup; index: number; level: number };

/** The group holding `id`, its index there, and that group's level (the root is 1). */
export function locate(root: DraftGroup, id: string, level = 1): Located | null {
	for (const [index, node] of root.items.entries()) {
		if (node.id === id) return { parent: root, index, level };
		if (isDraftGroup(node)) {
			const found = locate(node, id, level + 1);
			if (found) return found;
		}
	}
	return null;
}

function findGroup(root: DraftGroup, id: string, level = 1): [DraftGroup, number] | null {
	if (root.id === id) return [root, level];
	for (const node of root.items) {
		if (!isDraftGroup(node)) continue;
		const found = findGroup(node, id, level + 1);
		if (found) return found;
	}
	return null;
}

function findNode(root: DraftGroup, id: string): DraftNode | null {
	if (root.id === id) return root;
	const at = locate(root, id);
	return at ? at.parent.items[at.index] : null;
}

/** The tree with group `id` replaced by `fn` of it; the same tree when nothing changed. */
function mapGroup(root: DraftGroup, id: string, fn: (g: DraftGroup) => DraftGroup): DraftGroup {
	if (root.id === id) return fn(root);
	let changed = false;
	const items = root.items.map((node) => {
		if (!isDraftGroup(node)) return node;
		const next = mapGroup(node, id, fn);
		if (next !== node) changed = true;
		return next;
	});
	return changed ? { ...root, items } : root;
}

export function updateCondition(root: DraftGroup, id: string, cond: Condition): DraftGroup {
	const at = locate(root, id);
	if (!at) return root;
	return mapGroup(root, at.parent.id, (g) => ({
		...g,
		items: g.items.map((n) => (n.id === id ? { ...cond, id } : n)),
	}));
}

export function setGroupOp(root: DraftGroup, id: string, op: "and" | "or"): DraftGroup {
	return mapGroup(root, id, (g) => (g.op === op ? g : { ...g, op }));
}

export function removeNode(root: DraftGroup, id: string): DraftGroup {
	const at = locate(root, id);
	if (!at) return root;
	return mapGroup(root, at.parent.id, (g) => ({
		...g,
		items: g.items.filter((n) => n.id !== id),
	}));
}

export function canAddGroup(root: DraftGroup, groupId: string): boolean {
	const found = findGroup(root, groupId);
	return !!found && found[1] < MAX_GROUP_LEVELS;
}

/** Appends `node` to group `groupId`, unless that would nest deeper than allowed. */
export function append(root: DraftGroup, groupId: string, node: DraftNode): DraftGroup {
	const found = findGroup(root, groupId);
	if (!found || found[1] + height(node) > MAX_GROUP_LEVELS) return root;
	return mapGroup(root, groupId, (g) => ({ ...g, items: [...g.items, node] }));
}

/**
 * Moves node `id` into group `groupId` at `index`, counted in that group's
 * items as they stand before the move. The same tree when the move is not
 * possible: into itself, or deeper than allowed.
 */
export function moveNode(root: DraftGroup, id: string, groupId: string, index: number): DraftGroup {
	const node = findNode(root, id);
	const from = locate(root, id);
	const target = findGroup(root, groupId);
	if (!node || !from || !target) return root;
	if (isDraftGroup(node) && findGroup(node, groupId)) return root;
	if (target[1] + height(node) > MAX_GROUP_LEVELS) return root;
	const sameGroup = from.parent.id === groupId;
	const at = sameGroup && from.index < index ? index - 1 : index;
	if (sameGroup && at === from.index) return root;
	const without = removeNode(root, id);
	return mapGroup(without, groupId, (g) => {
		const items = [...g.items];
		items.splice(Math.max(0, Math.min(at, items.length)), 0, node);
		return { ...g, items };
	});
}

/**
 * One step up or down: past the neighbouring row, or at a group's edge out of
 * the group, before or after it.
 */
export function moveBy(root: DraftGroup, id: string, delta: -1 | 1): DraftGroup {
	const at = locate(root, id);
	if (!at) return root;
	const next = at.index + delta;
	if (next >= 0 && next < at.parent.items.length) {
		return moveNode(root, id, at.parent.id, delta < 0 ? next : next + 1);
	}
	const outer = locate(root, at.parent.id);
	if (!outer) return root;
	return moveNode(root, id, outer.parent.id, delta < 0 ? outer.index : outer.index + 1);
}

/** Into the nearest group above it (to its end), else the nearest below (to its start). */
export function moveIntoGroup(root: DraftGroup, id: string): DraftGroup {
	const at = locate(root, id);
	if (!at) return root;
	const siblings = at.parent.items;
	for (let i = at.index - 1; i >= 0; i--) {
		const sibling = siblings[i];
		if (isDraftGroup(sibling)) return moveNode(root, id, sibling.id, sibling.items.length);
	}
	for (let i = at.index + 1; i < siblings.length; i++) {
		const sibling = siblings[i];
		if (isDraftGroup(sibling)) return moveNode(root, id, sibling.id, 0);
	}
	return root;
}

export function isDraftComplete(group: DraftGroup): boolean {
	return group.items.every((n) => (isDraftGroup(n) ? isDraftComplete(n) : isConditionComplete(n)));
}
