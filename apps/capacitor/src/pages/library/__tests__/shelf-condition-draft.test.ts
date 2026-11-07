import { describe, expect, it } from "vitest";
import type { ConditionGroup } from "../condition-tree";
import {
	append,
	canAddGroup,
	type DraftGroup,
	type DraftNode,
	fromDraft,
	isDraftComplete,
	isDraftGroup,
	moveBy,
	moveIntoGroup,
	moveNode,
	newCondition,
	newGroup,
	removeNode,
	setGroupOp,
	toDraft,
	updateCondition,
} from "../shelf-condition-draft";

const tag = (value: string) => ({ field: "tags", op: "is", value });

/** The tree as tag values and nested arrays, `|` heading an any-group. */
function shape(group: DraftGroup): unknown[] {
	const items = group.items.map((n: DraftNode) =>
		isDraftGroup(n) ? shape(n) : (n.value as string),
	);
	return group.op === "or" ? ["|", ...items] : items;
}

const tree: ConditionGroup = {
	op: "and",
	items: [tag("a"), { op: "or", items: [tag("b"), tag("c")] }, tag("d")],
};

const idOf = (root: DraftGroup, value: string): string => {
	const walk = (g: DraftGroup): string | null => {
		for (const n of g.items) {
			if (isDraftGroup(n)) {
				const found = walk(n);
				if (found) return found;
			} else if (n.value === value) return n.id;
		}
		return null;
	};
	return walk(root) as string;
};
const groupAt = (root: DraftGroup, index: number) => root.items[index] as DraftGroup;

describe("shelf condition draft", () => {
	it("round-trips a tree", () => {
		expect(fromDraft(toDraft(tree))).toEqual({ v: 1, root: tree });
	});

	it("moves a row up and down, out of a group at its edge", () => {
		const root = toDraft(tree);
		expect(shape(moveBy(root, idOf(root, "c"), -1))).toEqual(["a", ["|", "c", "b"], "d"]);
		expect(shape(moveBy(root, idOf(root, "b"), -1))).toEqual(["a", "b", ["|", "c"], "d"]);
		expect(shape(moveBy(root, idOf(root, "c"), 1))).toEqual(["a", ["|", "b"], "c", "d"]);
		expect(shape(moveBy(root, idOf(root, "a"), 1))).toEqual([["|", "b", "c"], "a", "d"]);
		expect(moveBy(root, idOf(root, "a"), -1)).toBe(root);
		expect(moveBy(root, idOf(root, "d"), 1)).toBe(root);
	});

	it("moves a row into the nearest group, above first", () => {
		const root = toDraft(tree);
		expect(shape(moveIntoGroup(root, idOf(root, "d")))).toEqual(["a", ["|", "b", "c", "d"]]);
		expect(shape(moveIntoGroup(root, idOf(root, "a")))).toEqual([["|", "a", "b", "c"], "d"]);
		expect(moveIntoGroup(root, idOf(root, "b"))).toBe(root);
	});

	it("drops at an index counted before the move, never into itself", () => {
		const root = toDraft(tree);
		const group = groupAt(root, 1);
		expect(shape(moveNode(root, idOf(root, "a"), root.id, 3))).toEqual([["|", "b", "c"], "d", "a"]);
		expect(shape(moveNode(root, idOf(root, "d"), group.id, 1))).toEqual([
			"a",
			["|", "b", "d", "c"],
		]);
		expect(moveNode(root, idOf(root, "a"), root.id, 1)).toBe(root);
		expect(moveNode(root, group.id, group.id, 0)).toBe(root);
	});

	it("nests no deeper than three groups, the shelf's own counted", () => {
		let root = toDraft(tree);
		const second = groupAt(root, 1);
		expect(canAddGroup(root, root.id)).toBe(true);
		expect(canAddGroup(root, second.id)).toBe(true);
		root = append(root, second.id, newGroup());
		const third = groupAt(root, 1).items[2] as DraftGroup;
		expect(canAddGroup(root, third.id)).toBe(false);
		expect(append(root, third.id, newGroup())).toBe(root);
		// A group holding a group cannot move into the third level.
		const deep = groupAt(root, 1);
		root = append(root, root.id, newGroup());
		const sibling = root.items[root.items.length - 1] as DraftGroup;
		expect(moveNode(root, deep.id, sibling.id, 0)).toBe(root);
		expect(moveIntoGroup(root, deep.id)).toBe(root);
	});

	it("edits, switches and removes nodes, leaving untouched groups as they were", () => {
		const root = toDraft(tree);
		const group = groupAt(root, 1);
		const edited = updateCondition(root, idOf(root, "a"), tag("z"));
		expect(shape(edited)).toEqual(["z", ["|", "b", "c"], "d"]);
		expect(groupAt(edited, 1)).toBe(group);
		expect(shape(setGroupOp(root, group.id, "and"))).toEqual(["a", ["b", "c"], "d"]);
		expect(setGroupOp(root, group.id, "or")).toBe(root);
		expect(shape(removeNode(root, group.id))).toEqual(["a", "d"]);
	});

	it("is complete only when every row has its value", () => {
		const root = toDraft(tree);
		expect(isDraftComplete(root)).toBe(true);
		expect(isDraftComplete(append(root, groupAt(root, 1).id, newCondition()))).toBe(false);
	});
});
