import { RATING_STARS } from "@lesefluss/core";
import { type Condition, isNumberRange, localDayStart } from "./condition-tree";
import type { Facet } from "./filter-model";

/** What a condition's value is, and so which input the editor shows for it. */
export type ValueKind = "pick" | "text" | "number" | "stars" | "range" | "days" | "date" | "none";

export type OperatorSpec = { op: string; label: string; kind: ValueKind };

export type FieldSpec = {
	field: string;
	label: string;
	/** The facet whose values a `pick` offers. */
	facet?: Facet;
	/** Shown after a number. */
	unit?: string;
	ops: readonly OperatorSpec[];
};

const IS: OperatorSpec = { op: "is", label: "is", kind: "pick" };
const NOT: OperatorSpec = { op: "not", label: "is not", kind: "pick" };
const EMPTY: OperatorSpec = { op: "empty", label: "is empty", kind: "none" };
const CONTAINS: OperatorSpec = { op: "contains", label: "contains", kind: "text" };
const NOT_CONTAINS: OperatorSpec = { op: "notContains", label: "does not contain", kind: "text" };
const AT_LEAST: OperatorSpec = { op: "gte", label: "at least", kind: "number" };
const AT_MOST: OperatorSpec = { op: "lte", label: "at most", kind: "number" };
const BETWEEN: OperatorSpec = { op: "between", label: "between", kind: "range" };
const DATE_OPS: readonly OperatorSpec[] = [
	{ op: "within", label: "within the last", kind: "days" },
	{ op: "before", label: "before", kind: "date" },
	{ op: "after", label: "after", kind: "date" },
];

/** Every field the shelf editor offers. `is` and `not` on a facet are what the chips save. */
export const CONDITION_FIELDS: readonly FieldSpec[] = [
	{ field: "status", label: "Status", facet: "status", ops: [IS, NOT] },
	{
		field: "tags",
		label: "Tag",
		facet: "tags",
		ops: [
			{ op: "is", label: "contains", kind: "pick" },
			{ op: "not", label: "does not contain", kind: "pick" },
			EMPTY,
		],
	},
	{
		field: "author",
		label: "Author",
		facet: "author",
		ops: [IS, NOT, CONTAINS, NOT_CONTAINS, EMPTY],
	},
	{ field: "series", label: "Series", facet: "series", ops: [IS, NOT, EMPTY] },
	{ field: "collection", label: "Collection", facet: "collection", ops: [IS, NOT, EMPTY] },
	{
		field: "rating",
		label: "Rating",
		facet: "rating",
		ops: [{ ...AT_LEAST, kind: "stars" }, { ...AT_MOST, kind: "stars" }, IS, NOT, EMPTY],
	},
	{
		field: "progress",
		label: "Progress",
		facet: "progress",
		unit: "%",
		ops: [AT_LEAST, AT_MOST, BETWEEN, IS, NOT],
	},
	{ field: "timeLeft", label: "Time left", facet: "timeLeft", ops: [IS, NOT] },
	{ field: "words", label: "Length", unit: "words", ops: [AT_LEAST, AT_MOST, BETWEEN, EMPTY] },
	{ field: "added", label: "Date added", facet: "added", ops: [...DATE_OPS, IS] },
	{ field: "lastRead", label: "Last read", facet: "lastRead", ops: [...DATE_OPS, IS, EMPTY] },
	{ field: "title", label: "Title", ops: [CONTAINS, NOT_CONTAINS] },
];

export function fieldSpec(field: string): FieldSpec | undefined {
	return CONDITION_FIELDS.find((f) => f.field === field);
}

export function operatorSpec(field: string, op: string): OperatorSpec | undefined {
	return fieldSpec(field)?.ops.find((o) => o.op === op);
}

const DEFAULT_DAYS = 30;

export function defaultValue(kind: ValueKind): unknown {
	if (kind === "pick" || kind === "text") return "";
	if (kind === "days") return DEFAULT_DAYS;
	return null;
}

/** The condition with `field` and its first operator, the value reset. */
export function withField(field: string): Condition {
	const op = fieldSpec(field)?.ops[0];
	return { field, op: op?.op ?? "", value: op ? defaultValue(op.kind) : null };
}

/** Keeps the value while the new operator takes the same kind of value. */
export function withOperator(cond: Condition, op: string): Condition {
	const from = operatorSpec(cond.field, cond.op);
	const to = operatorSpec(cond.field, op);
	if (!to) return cond;
	return { ...cond, op, value: from?.kind === to.kind ? cond.value : defaultValue(to.kind) };
}

const isCount = (v: unknown, min: number): v is number =>
	typeof v === "number" && Number.isInteger(v) && v >= min;

/**
 * Whether a row has a value its operator can use. A condition this client does
 * not know (written by a newer one) counts as complete, so it is kept as is.
 */
export function isConditionComplete(cond: Condition): boolean {
	const spec = operatorSpec(cond.field, cond.op);
	if (!spec) return true;
	const { value } = cond;
	switch (spec.kind) {
		case "pick":
		case "text":
			return typeof value === "string" && value.trim() !== "";
		case "number":
			return typeof value === "number" && Number.isFinite(value) && value >= 0;
		case "stars":
			return isCount(value, 1) && value <= RATING_STARS;
		case "range":
			return isNumberRange(value) && value.min >= 0 && value.max >= 0;
		case "days":
			return isCount(value, 0);
		case "date":
			return localDayStart(value) != null;
		case "none":
			return true;
	}
}
