// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { SocialError } from "./errors";
import { liveBoard, liveChecks, openLiveStream, reportLive, sweep } from "./live";

const READ = "00000000-0000-4000-8000-000000000001";
const report = (position: number) => ({ position, mode: "scroll" as const, dialWpm: null });

function asMember() {
	vi.spyOn(liveChecks, "memberView").mockResolvedValue({
		wordCount: 1000,
		visible: new Set(["ann", "bo"]),
	});
}

async function readSnapshot(reader: ReadableStreamDefaultReader<Uint8Array>) {
	const { value } = await reader.read();
	const text = new TextDecoder().decode(value);
	return JSON.parse(text.split("data: ")[1] ?? "null");
}

afterEach(() => {
	vi.restoreAllMocks();
	liveBoard.stopEverywhere("ann");
	liveBoard.stopEverywhere("bo");
});

describe("live sweep", () => {
	test("a failing opt-out check leaves the reader and finishes the round", async () => {
		asMember();
		vi.spyOn(liveChecks, "sharesLive").mockResolvedValue(true);
		await reportLive("ann", READ, report(10));
		await reportLive("bo", READ, report(20));

		vi.spyOn(liveChecks, "sharesLive").mockImplementation(async (userId) => {
			if (userId === "ann") throw new Error("connection reset");
			return false;
		});
		await expect(sweep(new Date())).resolves.toBeUndefined();

		const left = liveBoard.members(READ, Date.now()).map((m) => m.userId);
		// Ann's check failed, so she stays; Bo's check ran and he opted out.
		expect(left).toEqual(["ann"]);
	});

	test("a transient membership error changes nothing; not_found stops the reader", async () => {
		asMember();
		vi.spyOn(liveChecks, "sharesLive").mockResolvedValue(true);
		await reportLive("ann", READ, report(10));

		vi.spyOn(liveChecks, "memberView").mockRejectedValue(new Error("timeout"));
		await sweep(new Date());
		expect(liveBoard.members(READ, Date.now()).map((m) => m.userId)).toEqual(["ann"]);

		vi.spyOn(liveChecks, "memberView").mockRejectedValue(new SocialError("not_found"));
		await sweep(new Date());
		expect(liveBoard.members(READ, Date.now())).toEqual([]);
	});

	test("a viewer who is no longer a member has their stream closed; a transient error keeps it", async () => {
		asMember();
		vi.spyOn(liveChecks, "sharesLive").mockResolvedValue(true);
		const res = await openLiveStream("bo", READ, new AbortController().signal);
		const reader = (res.body as ReadableStream<Uint8Array>).getReader();
		expect(await readSnapshot(reader)).toMatchObject({ live: true });

		vi.spyOn(liveChecks, "memberView").mockRejectedValue(new Error("timeout"));
		await sweep(new Date());
		// Still open: the round's broadcast arrives with the viewer unchanged.
		expect(await readSnapshot(reader)).toMatchObject({ live: true });

		vi.spyOn(liveChecks, "memberView").mockRejectedValue(new SocialError("not_found"));
		await sweep(new Date());
		expect((await reader.read()).done).toBe(true);
	});

	test("an opted-out viewer keeps the stream but receives nothing live", async () => {
		asMember();
		vi.spyOn(liveChecks, "sharesLive").mockResolvedValue(true);
		await reportLive("ann", READ, report(10));
		const res = await openLiveStream("bo", READ, new AbortController().signal);
		const reader = (res.body as ReadableStream<Uint8Array>).getReader();
		expect((await readSnapshot(reader)).members).toHaveLength(1);

		vi.spyOn(liveChecks, "sharesLive").mockImplementation(async (u) => u !== "bo");
		await sweep(new Date());
		expect(await readSnapshot(reader)).toEqual({ buddyReadId: READ, live: false, members: [] });
		await reader.cancel();
	});
});
