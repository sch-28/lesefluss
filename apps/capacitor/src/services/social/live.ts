import type { LiveActionBody, LiveSnapshot } from "@lesefluss/core";
import { SOCIAL_API } from "@lesefluss/core";
import { useEffect, useRef, useState } from "react";
import { AuthedFetchError, authedFetch } from "../authed-fetch";

async function act(body: LiveActionBody, keepalive = false): Promise<void> {
	await authedFetch(SOCIAL_API.live, { method: "POST", body: JSON.stringify(body), keepalive });
}

export const liveClient = {
	report: (
		buddyReadId: string,
		position: number,
		mode: "rsvp" | "scroll" | "page",
		dialWpm: number | null,
	) => act({ action: "report", buddyReadId, position, mode, dialWpm, sentAt: Date.now() }),
	/** `keepalive` lets the request outlive a closing page. */
	stop: (buddyReadId: string, keepalive = false) =>
		act({ action: "stop", buddyReadId, sentAt: Date.now() }, keepalive),
};

/**
 * An answer that retrying cannot change: not a member (any more), the read is
 * over, a malformed request, or no session. Network errors, 429 and 5xx are
 * worth another try.
 */
export function isPermanentLiveError(err: unknown): boolean {
	return err instanceof AuthedFetchError && [400, 401, 403, 404].includes(err.status);
}

const RETRY_MS = [1000, 2000, 4000, 8000];

/** Splits an SSE body into events, returning the unfinished tail for the next chunk. */
export function parseSse(buffer: string): {
	events: { event: string; data: string }[];
	rest: string;
} {
	const blocks = buffer.split("\n\n");
	const rest = blocks.pop() ?? "";
	const events: { event: string; data: string }[] = [];
	for (const block of blocks) {
		let event = "message";
		const data: string[] = [];
		for (const line of block.split("\n")) {
			if (line.startsWith("event:")) event = line.slice(6).trim();
			else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
		}
		if (data.length > 0) events.push({ event, data: data.join("\n") });
	}
	return { events, rest };
}

/**
 * Who else is reading this buddy read right now, over server-sent events read
 * with fetch so the bearer token (native) and the cookie (web build) both
 * work. The snapshot is null while disabled or not connected; it reconnects
 * with backoff, and gives up for good on a permanent answer.
 */
export function useLiveBoard(
	buddyReadId: string | null,
	enabled: boolean,
): { snapshot: LiveSnapshot | null; isUnavailable: boolean } {
	const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
	const [isUnavailable, setIsUnavailable] = useState(false);
	const attempt = useRef(0);

	useEffect(() => {
		setIsUnavailable(false);
		if (!buddyReadId || !enabled) return;
		const controller = new AbortController();
		let retry: ReturnType<typeof setTimeout> | null = null;

		const connect = async () => {
			try {
				const res = await authedFetch(
					`${SOCIAL_API.liveStream}?buddyReadId=${encodeURIComponent(buddyReadId)}`,
					{ signal: controller.signal, headers: { Accept: "text/event-stream" } },
				);
				const reader = res.body?.getReader();
				if (!reader) throw new Error("no stream body");
				attempt.current = 0;
				const decoder = new TextDecoder();
				let buffer = "";
				for (;;) {
					const { value, done } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const parsed = parseSse(buffer);
					buffer = parsed.rest;
					for (const e of parsed.events) {
						if (e.event === "snapshot") setSnapshot(JSON.parse(e.data) as LiveSnapshot);
					}
				}
			} catch (err) {
				if (controller.signal.aborted) return;
				if (isPermanentLiveError(err)) {
					setSnapshot(null);
					setIsUnavailable(true);
					return;
				}
			}
			if (controller.signal.aborted) return;
			setSnapshot(null);
			const delay = RETRY_MS[Math.min(attempt.current, RETRY_MS.length - 1)] ?? 8000;
			attempt.current++;
			retry = setTimeout(() => void connect(), delay);
		};
		void connect();
		return () => {
			controller.abort();
			if (retry) clearTimeout(retry);
			setSnapshot(null);
		};
	}, [buddyReadId, enabled]);

	return { snapshot, isUnavailable };
}
