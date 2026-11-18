import { beforeEach, describe, expect, it } from "vitest";
import { linkSingleBook, readSingleBookLinks } from "../book-links";

const KEY = "lesefluss:single-book-links";

beforeEach(() => localStorage.clear());

describe("single-book links", () => {
	it("keeps earlier links when a new one is added", () => {
		linkSingleBook("57569a1c", "2a41e018");
		linkSingleBook("11111111", "0badf00d");
		expect(readSingleBookLinks()).toEqual({ "57569a1c": "2a41e018", "11111111": "0badf00d" });
	});

	it("reads corrupt or foreign storage as no links", () => {
		localStorage.setItem(KEY, "not json");
		expect(readSingleBookLinks()).toEqual({});
		localStorage.setItem(KEY, "[1]");
		expect(readSingleBookLinks()).toEqual({});
		localStorage.setItem(KEY, '{"a":1,"b":"x"}');
		expect(readSingleBookLinks()).toEqual({ b: "x" });
	});
});
