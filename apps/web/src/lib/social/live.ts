import type { LiveReport, LiveSnapshot } from "@lesefluss/core";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { buddyRead, socialProfile } from "~/db/schema";
import { loadState, visibleTo } from "./buddy-reads";
import { SocialError } from "./errors";
import { LiveBoard } from "./live-board";

const TICK_MS = 1000;
const SWEEP_MS = 5000;
const HEARTBEAT_MS = 15_000;

type Listener = {
	userId: string;
	send: (chunk: string) => void;
	/** Whether this viewer shares, and so sees, live activity. */
	isLive: boolean;
	visible: Set<string>;
};

const listeners = new Map<string, Set<Listener>>();

export const liveBoard = new LiveBoard(broadcast);

/** The member's copy and who they may see; not_found unless they are a current member with a live book. */
async function memberView(userId: string, buddyReadId: string, now: Date) {
	const [read] = await db.select().from(buddyRead).where(eq(buddyRead.id, buddyReadId));
	if (!read) throw new SocialError("not_found");
	const state = await loadState(db, read, now);
	const member = state.current.find((m) => m.userId === userId);
	if (state.takenDown || !member?.book?.wordCount) throw new SocialError("not_found");
	return {
		wordCount: member.book.wordCount,
		visible: await visibleTo(db, userId, state.users, now),
	};
}

async function sharesLive(userId: string): Promise<boolean> {
	const [row] = await db
		.select({ on: socialProfile.shareLiveReading })
		.from(socialProfile)
		.where(eq(socialProfile.userId, userId));
	return row?.on ?? true;
}

export function snapshotFor(
	buddyReadId: string,
	viewer: Pick<Listener, "userId" | "isLive" | "visible">,
	now: number,
): LiveSnapshot {
	return {
		buddyReadId,
		live: viewer.isLive,
		members: viewer.isLive
			? liveBoard
					.members(buddyReadId, now)
					.filter((m) => m.userId !== viewer.userId && viewer.visible.has(m.userId))
			: [],
	};
}

function sse(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function broadcast(buddyReadId: string): void {
	const now = Date.now();
	for (const l of listeners.get(buddyReadId) ?? []) {
		l.send(sse("snapshot", snapshotFor(buddyReadId, l, now)));
	}
}

let isSweeping = false;

/**
 * Readers who left the buddy read, were removed or lost the book drop off, and
 * blocks and opt-outs made since a stream opened take effect.
 */
async function sweep(now: Date): Promise<void> {
	if (isSweeping) return;
	isSweeping = true;
	try {
		for (const buddyReadId of liveBoard.readIds()) {
			for (const m of liveBoard.members(buddyReadId, now.getTime())) {
				const ok = await memberView(m.userId, buddyReadId, now).then(
					async () => sharesLive(m.userId),
					() => false,
				);
				if (!ok) liveBoard.stop(buddyReadId, m.userId);
			}
		}
		for (const [buddyReadId, set] of listeners) {
			for (const l of set) {
				try {
					l.visible = (await memberView(l.userId, buddyReadId, now)).visible;
					l.isLive = await sharesLive(l.userId);
				} catch {
					l.visible = new Set([l.userId]);
					l.isLive = false;
				}
			}
			broadcast(buddyReadId);
		}
	} finally {
		isSweeping = false;
	}
}

let ticker: ReturnType<typeof setInterval> | null = null;
let lastSweep = 0;

function ensureTicker(): void {
	if (ticker) return;
	ticker = setInterval(() => {
		const now = Date.now();
		liveBoard.tick(now);
		if (now - lastSweep >= SWEEP_MS) {
			lastSweep = now;
			void sweep(new Date(now));
		}
	}, TICK_MS);
	ticker.unref?.();
}

/** A report from someone who opted out is dropped: they share nothing live. */
export async function reportLive(
	userId: string,
	buddyReadId: string,
	report: LiveReport,
	now = new Date(),
): Promise<void> {
	const { wordCount } = await memberView(userId, buddyReadId, now);
	if (report.position > wordCount) throw new SocialError("invalid");
	if (!(await sharesLive(userId))) return;
	ensureTicker();
	liveBoard.report(buddyReadId, userId, report, wordCount, now.getTime());
}

export function stopLive(userId: string, buddyReadId: string): void {
	liveBoard.stop(buddyReadId, userId);
}

/** Opting out takes the user off every board at once; their open streams catch up on the next sweep. */
export function onShareLiveReadingOff(userId: string): void {
	liveBoard.stopEverywhere(userId);
}

/**
 * Server-sent events for one buddy read's live board: a `snapshot` on every
 * change, and a comment every 15 s so proxies keep the connection open.
 */
export async function openLiveStream(
	userId: string,
	buddyReadId: string,
	signal: AbortSignal,
): Promise<Response> {
	const { visible } = await memberView(userId, buddyReadId, new Date());
	const isLive = await sharesLive(userId);
	ensureTicker();
	const encoder = new TextEncoder();
	let cleanup = () => {};
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let isOpen = true;
			const listener: Listener = {
				userId,
				isLive,
				visible,
				send: (chunk) => {
					if (!isOpen) return;
					try {
						controller.enqueue(encoder.encode(chunk));
					} catch {
						cleanup();
					}
				},
			};
			const set = listeners.get(buddyReadId) ?? new Set<Listener>();
			set.add(listener);
			listeners.set(buddyReadId, set);
			listener.send(sse("snapshot", snapshotFor(buddyReadId, listener, Date.now())));
			const heartbeat = setInterval(() => listener.send(": ping\n\n"), HEARTBEAT_MS);
			cleanup = () => {
				if (!isOpen) return;
				isOpen = false;
				clearInterval(heartbeat);
				set.delete(listener);
				if (set.size === 0) listeners.delete(buddyReadId);
				try {
					controller.close();
				} catch {}
			};
			signal.addEventListener("abort", () => cleanup());
		},
		cancel() {
			cleanup();
		},
	});
	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-store",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}
