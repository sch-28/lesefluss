import type { RawInput } from "../types";

export type BytesInput = Extract<RawInput, { kind: "bytes" }>;
export type TextInput = Extract<RawInput, { kind: "text" }>;

/**
 * Narrow a `RawInput` to its bytes variant. Parsers call this at the top of
 * `parse` after `canParse` has already guaranteed the shape via the registry,
 * so the throw is unreachable in practice but gives us proper type narrowing
 * without `as` casts.
 */
export function assertBytes(input: RawInput): asserts input is BytesInput {
	if (input.kind !== "bytes") {
		throw new Error("Expected bytes input");
	}
}

export function assertText(input: RawInput): asserts input is TextInput {
	if (input.kind !== "text") {
		throw new Error("Expected text input");
	}
}
