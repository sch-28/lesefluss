import { describe, expect, test } from "vitest";
import { parseSse } from "../live";

describe("parseSse", () => {
	test("splits complete events and keeps the unfinished tail", () => {
		const { events, rest } = parseSse(
			'event: snapshot\ndata: {"a":1}\n\n: ping\n\nevent: snapshot\ndata: nu',
		);
		expect(events).toEqual([{ event: "snapshot", data: '{"a":1}' }]);
		expect(rest).toBe("event: snapshot\ndata: nu");
	});

	test("a tail completed by the next chunk parses", () => {
		const first = parseSse("event: snapshot\ndata: nu");
		const second = parseSse(`${first.rest}ll\n\n`);
		expect(second.events).toEqual([{ event: "snapshot", data: "null" }]);
		expect(second.rest).toBe("");
	});
});
