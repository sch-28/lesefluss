import { DEFAULT_SETTINGS, type RsvpSettings } from "@lesefluss/core";
import { describe, expect, it, vi } from "vitest";
import {
	type ClientHandlers,
	createChannelPort,
	createClient,
	createFollower,
	createMemoryLink,
	type FollowerHandlers,
	type FromMini,
	MINI_PING_MS,
	MINI_TIMEOUT_MS,
	type MiniStart,
	type ToMini,
} from "../mini-bridge";

const SETTINGS: RsvpSettings = {
	wpm: DEFAULT_SETTINGS.WPM,
	delayComma: DEFAULT_SETTINGS.DELAY_COMMA,
	delayPeriod: DEFAULT_SETTINGS.DELAY_PERIOD,
	accelStart: DEFAULT_SETTINGS.ACCEL_START,
	accelRate: DEFAULT_SETTINGS.ACCEL_RATE,
	xOffset: DEFAULT_SETTINGS.X_OFFSET,
	focalLetterColor: DEFAULT_SETTINGS.FOCAL_LETTER_COLOR,
};

const START: MiniStart = {
	bookId: "b1",
	title: "Morning Star",
	content: "The rain falls in sheets.",
	wordIndex: null,
	startWord: 3,
	settings: SETTINGS,
	focalColor: "#ff3b30",
	appearance: null,
};

function fakeTimers() {
	let now = 0;
	const intervals = new Map<number, { fn: () => void; ms: number; next: number }>();
	let nextId = 1;
	return {
		timers: {
			setInterval: (fn: () => void, ms: number) => {
				const id = nextId++;
				intervals.set(id, { fn, ms, next: now + ms });
				return id;
			},
			clearInterval: (id: number) => {
				intervals.delete(id);
			},
			now: () => now,
		},
		advance(ms: number) {
			const until = now + ms;
			for (;;) {
				const due = [...intervals.entries()].sort((a, b) => a[1].next - b[1].next)[0];
				if (!due || due[1].next > until) break;
				now = due[1].next;
				due[1].next += due[1].ms;
				due[1].fn();
			}
			now = until;
		},
		/** The clock moves on while no interval runs, then the overdue ones run once. */
		stall(ms: number) {
			now += ms;
			for (const entry of intervals.values()) entry.next = now;
		},
	};
}

function pair({ watchdog = false } = {}) {
	const link = createMemoryLink();
	const main: FollowerHandlers = {
		getStart: vi.fn(() => START),
		onShown: vi.fn(),
		onSave: vi.fn(),
		onWpm: vi.fn(),
		onClosed: vi.fn(),
	};
	const mini: ClientHandlers = {
		onStart: vi.fn(),
		onPosition: vi.fn(),
		onSettings: vi.fn(),
		onStop: vi.fn(),
	};
	const follower = createFollower(link.main, main);
	const clock = fakeTimers();
	const client = createClient(link.mini, mini, { watchdog, timers: clock.timers });
	return { link, main, mini, follower, client, clock };
}

describe("mini bridge", () => {
	it("hands the mini the book once it is ready", () => {
		const { mini } = pair();
		expect(mini.onStart).toHaveBeenCalledExactlyOnceWith(START);
	});

	it("holds what the mini sends before the reader listens", () => {
		const link = createMemoryLink();
		const onStart = vi.fn();
		createClient(
			link.mini,
			{ onStart, onPosition: vi.fn(), onSettings: vi.fn(), onStop: vi.fn() },
			{ watchdog: false },
		);
		createFollower(link.main, {
			getStart: () => START,
			onShown: vi.fn(),
			onSave: vi.fn(),
			onWpm: vi.fn(),
			onClosed: vi.fn(),
		});
		expect(onStart).toHaveBeenCalledExactlyOnceWith(START);
	});

	it("passes the mini's words to the reader: shown ones as the spot, reports as saves", () => {
		const { main, client, follower } = pair();
		client.shown(4);
		client.shown(5);
		expect(main.onShown).toHaveBeenLastCalledWith(5);
		expect(follower.unsavedWord()).toBe(5);
		client.save(5, true);
		expect(main.onSave).toHaveBeenCalledExactlyOnceWith(5, true);
		expect(follower.isPlaying()).toBe(true);
		expect(follower.unsavedWord()).toBeNull();
		client.save(6, false);
		expect(follower.isPlaying()).toBe(false);
	});

	it("a takeover pauses the mini at the reader's word and drops its older reports", () => {
		const link = createMemoryLink();
		const onSave = vi.fn();
		const onShown = vi.fn();
		const follower = createFollower(link.main, {
			getStart: () => START,
			onShown,
			onSave,
			onWpm: vi.fn(),
			onClosed: vi.fn(),
		});
		// A report already on its way when the reader moved: sent under the old epoch.
		const late: FromMini = { type: "save", word: 40, isPlaying: true, epoch: 0 };
		const sent: ToMini[] = [];
		link.mini.listen((m) => sent.push(m));
		follower.takeover(900);
		expect(sent).toContainEqual({ type: "position", word: 900, epoch: 1 });
		link.mini.send(late);
		link.mini.send({ type: "shown", word: 41, epoch: 0 });
		expect(onSave).not.toHaveBeenCalled();
		expect(onShown).not.toHaveBeenCalled();
		expect(follower.isPlaying()).toBe(false);
		link.mini.send({ type: "save", word: 905, isPlaying: true, epoch: 1 });
		expect(onSave).toHaveBeenCalledExactlyOnceWith(905, true);
	});

	it("the mini reports under the epoch of the latest takeover", () => {
		const { main, mini, client, follower } = pair();
		follower.takeover(900);
		expect(mini.onPosition).toHaveBeenCalledExactlyOnceWith(900);
		client.save(901, true);
		expect(main.onSave).toHaveBeenCalledExactlyOnceWith(901, true);
	});

	it("a popup that boots after a takeover reports under that takeover's epoch", () => {
		const link = createMemoryLink();
		let isBooting = true;
		const lossyMain = {
			...link.main,
			send: (message: ToMini) => {
				if (!isBooting) link.main.send(message);
			},
		};
		const onSave = vi.fn();
		const follower = createFollower(lossyMain, {
			getStart: () => START,
			onShown: vi.fn(),
			onSave,
			onWpm: vi.fn(),
			onClosed: vi.fn(),
		});
		// A channel drops what is sent before the popup listens.
		follower.takeover(900);
		isBooting = false;
		const client = createClient(
			link.mini,
			{ onStart: vi.fn(), onPosition: vi.fn(), onSettings: vi.fn(), onStop: vi.fn() },
			{ watchdog: false },
		);
		client.save(901, true);
		expect(onSave).toHaveBeenCalledExactlyOnceWith(901, true);
	});

	it("stop reaches the mini once, with the reader's word, and silences it", () => {
		const { main, mini, client, follower } = pair();
		follower.stop(77);
		follower.stop(78);
		expect(mini.onStop).toHaveBeenCalledExactlyOnceWith(77);
		client.save(80, false);
		client.shown(81);
		expect(main.onSave).not.toHaveBeenCalled();
		expect(main.onShown).not.toHaveBeenCalled();
	});

	it("forwards wpm changes, settings and the mini closing", () => {
		const { main, mini, client, follower } = pair();
		client.wpm(420);
		expect(main.onWpm).toHaveBeenCalledExactlyOnceWith(420);
		follower.sendSettings({ ...SETTINGS, wpm: 420 }, "#00f");
		expect(mini.onSettings).toHaveBeenCalledExactlyOnceWith({ ...SETTINGS, wpm: 420 }, "#00f");
		client.closed();
		expect(main.onClosed).toHaveBeenCalledOnce();
	});

	it("a detached reader hears nothing more", () => {
		const { main, client, follower } = pair();
		follower.detach();
		client.save(9, true);
		expect(main.onSave).not.toHaveBeenCalled();
	});

	it("with the watchdog, the popup pings and stays while the reader answers", () => {
		const { mini, clock } = pair({ watchdog: true });
		clock.advance(MINI_TIMEOUT_MS * 3);
		expect(mini.onStop).not.toHaveBeenCalled();
	});

	it("with the watchdog, a reader gone silent stops the popup without a word", () => {
		const { mini, follower, clock } = pair({ watchdog: true });
		follower.detach();
		clock.advance(MINI_TIMEOUT_MS - MINI_PING_MS);
		expect(mini.onStop).not.toHaveBeenCalled();
		clock.advance(MINI_PING_MS * 2);
		expect(mini.onStop).toHaveBeenCalledExactlyOnceWith(null);
	});

	it("with the watchdog, a late tick pings before it judges the reader gone", () => {
		const { mini, clock } = pair({ watchdog: true });
		// A sleeping machine or a throttled hidden popup: no tick for a minute.
		clock.stall(60_000);
		clock.advance(MINI_PING_MS);
		expect(mini.onStop).not.toHaveBeenCalled();
	});

	it("a pause is reported as paused, after the engine's own stop report", () => {
		const { main, client, follower } = pair();
		client.playing(true, 3);
		client.save(10, true);
		client.playing(false, 12);
		expect(main.onSave).toHaveBeenLastCalledWith(12, false);
		expect(follower.isPlaying()).toBe(false);
	});

	it("a stop by takeover is not reported back", () => {
		const { main, client, follower } = pair();
		client.playing(true, 3);
		follower.takeover(900);
		client.playing(false, 900);
		expect(main.onSave).not.toHaveBeenCalled();
		client.playing(true, 900);
		client.playing(false, 905);
		expect(main.onSave).toHaveBeenCalledExactlyOnceWith(905, false);
	});

	it("without the watchdog, silence never stops the mini", () => {
		const { mini, follower, clock } = pair();
		follower.detach();
		clock.advance(MINI_TIMEOUT_MS * 3);
		expect(mini.onStop).not.toHaveBeenCalled();
	});
});

describe("mini channel port", () => {
	type FakeChannel = {
		peers: FakeChannel[];
		listeners: Set<(e: MessageEvent) => void>;
		postMessage: (data: unknown) => void;
		addEventListener: (type: string, l: (e: MessageEvent) => void) => void;
		removeEventListener: (type: string, l: (e: MessageEvent) => void) => void;
		close: () => void;
	};
	function fakeChannel(): FakeChannel {
		const listeners = new Set<(e: MessageEvent) => void>();
		const peers: FakeChannel[] = [];
		const channel: FakeChannel = {
			peers,
			postMessage: (data: unknown) => {
				for (const peer of peers) for (const l of peer.listeners) l({ data } as MessageEvent);
			},
			addEventListener: (_, l) => {
				listeners.add(l);
			},
			removeEventListener: (_, l) => {
				listeners.delete(l);
			},
			close: vi.fn(),
			listeners,
		};
		return channel;
	}

	it("delivers between the two sides of one session only", () => {
		const a = fakeChannel();
		const b = fakeChannel();
		const other = fakeChannel();
		a.peers.push(b, other);
		b.peers.push(a, other);
		const main = createChannelPort<FromMini, ToMini>(
			"s1",
			"main",
			a as unknown as BroadcastChannel,
		);
		const mini = createChannelPort<ToMini, FromMini>(
			"s1",
			"mini",
			b as unknown as BroadcastChannel,
		);
		const stranger = createChannelPort<ToMini, FromMini>(
			"s2",
			"mini",
			other as unknown as BroadcastChannel,
		);
		const toMain = vi.fn();
		const toMini = vi.fn();
		const toStranger = vi.fn();
		main.listen(toMain);
		mini.listen(toMini);
		stranger.listen(toStranger);
		main.send({ type: "heartbeat" });
		mini.send({ type: "ping" });
		stranger.send({ type: "ready" });
		expect(toMini).toHaveBeenCalledExactlyOnceWith({ type: "heartbeat" });
		expect(toMain).toHaveBeenCalledExactlyOnceWith({ type: "ping" });
		expect(toStranger).not.toHaveBeenCalled();
		mini.close();
		expect(b.close).toHaveBeenCalledOnce();
		main.send({ type: "heartbeat" });
		expect(toMini).toHaveBeenCalledOnce();
	});
});
