import { afterEach, describe, expect, it } from "vitest";
import { ensureReadableStreamAsyncIterator } from "../stream-async-iterator";

type IterableProto = { [Symbol.asyncIterator]?: unknown };
const proto = ReadableStream.prototype as unknown as IterableProto;
const native = Object.getOwnPropertyDescriptor(proto, Symbol.asyncIterator);

afterEach(() => {
	if (native) Object.defineProperty(proto, Symbol.asyncIterator, native);
	else delete proto[Symbol.asyncIterator];
});

const streamOf = (chunks: string[]) =>
	new ReadableStream<string>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	});

describe("ensureReadableStreamAsyncIterator", () => {
	it("makes streams async-iterable on an engine without it, as pdf.js expects", async () => {
		delete proto[Symbol.asyncIterator];
		ensureReadableStreamAsyncIterator();
		const seen: string[] = [];
		for await (const chunk of streamOf(["a", "b"]) as unknown as AsyncIterable<string>) {
			seen.push(chunk);
		}
		expect(seen).toEqual(["a", "b"]);
	});

	it("releases the stream after an early break", async () => {
		delete proto[Symbol.asyncIterator];
		ensureReadableStreamAsyncIterator();
		const stream = streamOf(["a", "b"]);
		for await (const _ of stream as unknown as AsyncIterable<string>) break;
		expect(stream.locked).toBe(false);
	});

	it("leaves a native implementation alone", () => {
		const own = () => {};
		proto[Symbol.asyncIterator] = own;
		ensureReadableStreamAsyncIterator();
		expect(proto[Symbol.asyncIterator]).toBe(own);
	});
});
