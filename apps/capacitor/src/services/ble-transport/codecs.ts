import type { Codec } from "./types";

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

function dvFromString(value: string): DataView {
	return new DataView(encoder.encode(value).buffer);
}

function stringFromDv(view: DataView): string {
	return decoder.decode(view).replace(/\0+$/, "");
}

export const stringCodec: Codec<string> = {
	encode: dvFromString,
	decode: stringFromDv,
};

export function jsonCodec<T>(): Codec<T> {
	return {
		encode: (value) => dvFromString(JSON.stringify(value)),
		decode: (view) => JSON.parse(stringFromDv(view)) as T,
	};
}
