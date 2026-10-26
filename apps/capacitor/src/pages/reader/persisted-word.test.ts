import { describe, expect, it } from "vitest";
import { createPersistedWord } from "./persisted-word";

describe("createPersistedWord", () => {
	it("skips the seeded word and writes any other", () => {
		const p = createPersistedWord();
		p.set(10);
		expect(p.needsWrite(10)).toBe(false);
		expect(p.needsWrite(11)).toBe(true);
	});

	it("skips a word whose write is in flight", () => {
		const p = createPersistedWord();
		p.begin(20);
		expect(p.needsWrite(20)).toBe(false);
	});

	it("writes a word again after its write failed", () => {
		const p = createPersistedWord();
		p.set(10);
		const t = p.begin(20);
		p.fail(t);
		expect(p.needsWrite(20)).toBe(true);
		expect(p.needsWrite(10)).toBe(true);
	});

	it("keeps a newer write of the same word when an older one fails", () => {
		const p = createPersistedWord();
		const first = p.begin(20);
		p.begin(30);
		p.begin(20);
		p.fail(first);
		expect(p.needsWrite(20)).toBe(false);
	});

	it("keeps a newer write of another word when an older one fails", () => {
		const p = createPersistedWord();
		const first = p.begin(20);
		p.begin(30);
		p.fail(first);
		expect(p.get()).toBe(30);
	});

	it("keeps a device position set after a write that then fails", () => {
		const p = createPersistedWord();
		const t = p.begin(20);
		p.set(40);
		p.fail(t);
		expect(p.get()).toBe(40);
	});

	it("writes everything after a reset", () => {
		const p = createPersistedWord();
		p.set(10);
		p.set(null);
		expect(p.needsWrite(10)).toBe(true);
	});
});
