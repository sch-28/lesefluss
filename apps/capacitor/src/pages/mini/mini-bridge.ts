import type { RsvpSettings, WordIndex } from "@lesefluss/core";

export const MINI_CHANNEL = "lesefluss-mini";
/** How often the popup asks whether the main tab is still there. */
export const MINI_PING_MS = 2000;
/** A ping unanswered this long, the popup takes the main tab as gone. Generous: a hidden tab answers late. */
export const MINI_TIMEOUT_MS = 8000;

export type MiniStart = {
	bookId: string;
	title: string;
	content: string;
	/** Only across the portal: a WordIndex is a class and does not survive a channel. */
	wordIndex: WordIndex | null;
	startWord: number;
	settings: RsvpSettings;
	focalColor: string;
	/** Theme classes for a popup, which has no theme of its own. */
	appearance: { htmlClass: string; htmlStyle: string; bodyClass: string } | null;
};

/**
 * `epoch` counts the main tab's takeovers: a report the mini sent before it
 * learned of the latest one is about a word the reader has since moved away from.
 * `start` carries it too: a popup still booting misses the takeovers before it.
 */
export type ToMini =
	| { type: "start"; start: MiniStart; epoch: number }
	| { type: "position"; word: number; epoch: number }
	| { type: "settings"; settings: RsvpSettings; focalColor: string }
	| { type: "stop"; word: number }
	| { type: "heartbeat" };

export type FromMini =
	| { type: "ready" }
	| { type: "ping" }
	| { type: "shown"; word: number; epoch: number }
	| { type: "save"; word: number; isPlaying: boolean; epoch: number }
	| { type: "wpm"; wpm: number }
	| { type: "closed" };

export type Port<In, Out> = {
	send(message: Out): void;
	/** Messages sent before the first listener are held for it. */
	listen(listener: (message: In) => void): () => void;
	close(): void;
};

export type MainPort = Port<FromMini, ToMini>;
export type MiniPort = Port<ToMini, FromMini>;

function createEnd<In, Out>(deliver: (message: Out) => void) {
	const listeners = new Set<(message: In) => void>();
	const held: In[] = [];
	let isClosed = false;
	return {
		receive(message: In) {
			if (isClosed) return;
			if (listeners.size === 0) {
				held.push(message);
				return;
			}
			for (const listener of [...listeners]) listener(message);
		},
		port: {
			send: (message: Out) => {
				if (!isClosed) deliver(message);
			},
			listen: (listener: (message: In) => void) => {
				listeners.add(listener);
				for (const message of held.splice(0)) listener(message);
				return () => {
					listeners.delete(listener);
				};
			},
			close: () => {
				isClosed = true;
				listeners.clear();
				held.length = 0;
			},
		} satisfies Port<In, Out>,
	};
}

/**
 * Both ends in one realm (the Picture-in-Picture window is rendered from the
 * main tab). Synchronous, so a word shown just before the tab goes away has
 * already reached the reader's flush.
 */
export function createMemoryLink(): { main: MainPort; mini: MiniPort } {
	const main = createEnd<FromMini, ToMini>((message) => mini.receive(message));
	const mini = createEnd<ToMini, FromMini>((message) => main.receive(message));
	return { main: main.port, mini: mini.port };
}

type Envelope = { session: string; from: "main" | "mini"; message: unknown };

/** One end of the popup's BroadcastChannel; messages of other sessions are dropped. */
export function createChannelPort<In, Out>(
	session: string,
	side: "main" | "mini",
	channel: BroadcastChannel = new BroadcastChannel(MINI_CHANNEL),
): Port<In, Out> {
	const end = createEnd<In, Out>((message) => {
		channel.postMessage({ session, from: side, message } satisfies Envelope);
	});
	const onMessage = (event: MessageEvent<Envelope>) => {
		const data = event.data;
		if (data?.session !== session || data.from === side) return;
		end.receive(data.message as In);
	};
	channel.addEventListener("message", onMessage);
	return {
		...end.port,
		close: () => {
			end.port.close();
			channel.removeEventListener("message", onMessage);
			channel.close();
		},
	};
}

export type FollowerHandlers = {
	getStart: () => MiniStart | null;
	/** Every word the mini shows: the reader's spot, not saved. */
	onShown: (word: number) => void;
	/** The mini's save cadence and its stops: the reader saves this word. */
	onSave: (word: number, isPlaying: boolean) => void;
	onWpm: (wpm: number) => void;
	onClosed: () => void;
};

export type Follower = {
	/** The reader moved: the mini pauses there and its older reports are dropped. */
	takeover(word: number): void;
	sendSettings(settings: RsvpSettings, focalColor: string): void;
	/** The main tab leaves the book: the mini stops at `word`. */
	stop(word: number): void;
	isPlaying(): boolean;
	/** The last word the mini showed that no save has covered yet. */
	unsavedWord(): number | null;
	detach(): void;
};

/** The main tab's end. It is the only writer: the mini reports, the reader saves. */
export function createFollower(port: MainPort, handlers: FollowerHandlers): Follower {
	let epoch = 0;
	let isPlaying = false;
	let lastShown: number | null = null;
	let lastSaved: number | null = null;
	let isStopped = false;
	const unlisten = port.listen((message) => {
		if (isStopped) return;
		switch (message.type) {
			case "ready": {
				const start = handlers.getStart();
				if (start) port.send({ type: "start", start, epoch });
				return;
			}
			case "ping":
				port.send({ type: "heartbeat" });
				return;
			case "shown":
				if (message.epoch !== epoch) return;
				lastShown = message.word;
				handlers.onShown(message.word);
				return;
			case "save":
				if (message.epoch !== epoch) return;
				isPlaying = message.isPlaying;
				lastShown = message.word;
				lastSaved = message.word;
				handlers.onSave(message.word, message.isPlaying);
				return;
			case "wpm":
				handlers.onWpm(message.wpm);
				return;
			case "closed":
				isPlaying = false;
				handlers.onClosed();
				return;
		}
	});
	return {
		takeover(word) {
			if (isStopped) return;
			epoch++;
			isPlaying = false;
			lastShown = word;
			lastSaved = word;
			port.send({ type: "position", word, epoch });
		},
		sendSettings(settings, focalColor) {
			if (!isStopped) port.send({ type: "settings", settings, focalColor });
		},
		stop(word) {
			if (isStopped) return;
			isStopped = true;
			isPlaying = false;
			port.send({ type: "stop", word });
		},
		isPlaying: () => isPlaying,
		unsavedWord: () => (lastShown !== null && lastShown !== lastSaved ? lastShown : null),
		detach: () => {
			isStopped = true;
			isPlaying = false;
			unlisten();
		},
	};
}

export type ClientHandlers = {
	onStart: (start: MiniStart) => void;
	/** The reader took over at `word`: show it, paused, without reporting it back. */
	onPosition: (word: number) => void;
	onSettings: (settings: RsvpSettings, focalColor: string) => void;
	/** `word` is where the main tab saved; null when it went silent. */
	onStop: (word: number | null) => void;
};

export type Client = {
	shown(word: number): void;
	save(word: number, isPlaying: boolean): void;
	/**
	 * The engine started or stopped. A stop reports its word as paused: the
	 * engine's own stop report goes out before its playing state flips. Not
	 * after a takeover, whose word is the reader's own.
	 */
	playing(isPlaying: boolean, word: number): void;
	wpm(wpm: number): void;
	closed(): void;
	dispose(): void;
};

type Timers = {
	setInterval: (fn: () => void, ms: number) => number;
	clearInterval: (id: number) => void;
	now: () => number;
};

const browserTimers: Timers = {
	setInterval: (fn, ms) => window.setInterval(fn, ms),
	clearInterval: (id) => window.clearInterval(id),
	now: () => Date.now(),
};

/**
 * The mini window's end. With `watchdog`, it asks for a heartbeat every
 * MINI_PING_MS and stops when a ping stayed unanswered for MINI_TIMEOUT_MS: a
 * popup outlives a main tab that crashed or was killed without a pagehide.
 * Timed from the ping, not the last answer, so a late tick (sleep, a throttled
 * hidden popup) pings first instead of stopping.
 */
export function createClient(
	port: MiniPort,
	handlers: ClientHandlers,
	{ watchdog, timers = browserTimers }: { watchdog: boolean; timers?: Timers },
): Client {
	let epoch = 0;
	let isStarted = false;
	let isStopped = false;
	let unansweredSince: number | null = null;
	let wasPlaying = false;
	let isTakenOver = false;
	let interval: number | null = null;
	const stop = (word: number | null) => {
		if (isStopped) return;
		isStopped = true;
		if (interval !== null) timers.clearInterval(interval);
		interval = null;
		handlers.onStop(word);
	};
	const unlisten = port.listen((message) => {
		if (isStopped) return;
		unansweredSince = null;
		switch (message.type) {
			case "start":
				if (isStarted) return;
				isStarted = true;
				epoch = message.epoch;
				handlers.onStart(message.start);
				return;
			case "position":
				epoch = message.epoch;
				isTakenOver = true;
				handlers.onPosition(message.word);
				return;
			case "settings":
				handlers.onSettings(message.settings, message.focalColor);
				return;
			case "stop":
				stop(message.word);
				return;
			case "heartbeat":
				return;
		}
	});
	port.send({ type: "ready" });
	if (watchdog) {
		interval = timers.setInterval(() => {
			const now = timers.now();
			if (unansweredSince !== null && now - unansweredSince >= MINI_TIMEOUT_MS) {
				stop(null);
				return;
			}
			// Before sending: a memory link answers within the send.
			unansweredSince ??= now;
			port.send(isStarted ? { type: "ping" } : { type: "ready" });
		}, MINI_PING_MS);
	}
	const sendIfLive = (message: FromMini) => {
		if (!isStopped) port.send(message);
	};
	return {
		shown: (word) => sendIfLive({ type: "shown", word, epoch }),
		save: (word, isPlaying) => sendIfLive({ type: "save", word, isPlaying, epoch }),
		playing: (isPlaying, word) => {
			const wasStopped = wasPlaying && !isPlaying;
			wasPlaying = isPlaying;
			if (isPlaying) isTakenOver = false;
			else if (wasStopped && !isTakenOver)
				sendIfLive({ type: "save", word, isPlaying: false, epoch });
		},
		wpm: (wpm) => sendIfLive({ type: "wpm", wpm }),
		closed: () => sendIfLive({ type: "closed" }),
		dispose: () => {
			isStopped = true;
			if (interval !== null) timers.clearInterval(interval);
			interval = null;
			unlisten();
		},
	};
}
