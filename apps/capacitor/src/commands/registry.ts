import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { CommandScope } from "./scopes";

export type Command = {
	/** Unique across the app; a second registration of an id replaces the first. */
	id: string;
	title: string;
	keywords?: readonly string[];
	scope: CommandScope;
	/** See `matchesKey` for the syntax. The first key is the one the palette shows. */
	keys?: readonly string[];
	/** Off: neither its keys nor the palette offer it. */
	when?: () => boolean;
	/** Its keys also run with a button or link focused (Mod shortcuts, Escape). */
	inControls?: boolean;
	/** The browser's own action for these keys never runs in the app, even where the command can't. */
	claimsKeys?: boolean;
	/** Keys only, e.g. a contextual Escape. */
	isHiddenInPalette?: boolean;
	/** Leads the empty palette: the book to continue and the main screens. */
	isDestination?: boolean;
	/** Listed only once the user types: one per chapter or book would bury the rest. */
	isSearchOnly?: boolean;
	run: () => void;
};

type Registration = () => readonly Command[];

const registrations = new Map<object, Registration>();
const listeners = new Set<() => void>();
let version = 0;

function changed() {
	version++;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

// Keyed by the list itself, so a library with one command per book resolves in O(1).
const byIdCache = new WeakMap<readonly Command[], Map<string, Command>>();

function byIdOf(commands: readonly Command[]): Map<string, Command> {
	let byId = byIdCache.get(commands);
	if (!byId) {
		byId = new Map(commands.map((c) => [c.id, c]));
		byIdCache.set(commands, byId);
	}
	return byId;
}

/**
 * The latest render's version of a command, so a list kept across renders (the
 * palette's) never runs a stale closure or checks a stale `when`.
 */
function live(read: Registration, command: Command): Command {
	const latest = () => byIdOf(read()).get(command.id);
	return {
		...command,
		when: () => {
			const current = latest();
			return current ? (current.when?.() ?? true) : false;
		},
		run: () => latest()?.run(),
	};
}

/** In registration order; a later registration of an id wins. */
export function allCommands(): Command[] {
	const byId = new Map<string, Command>();
	for (const read of registrations.values()) {
		for (const command of read()) {
			byId.delete(command.id);
			byId.set(command.id, live(read, command));
		}
	}
	return [...byId.values()];
}

export function activeCommands(): Command[] {
	return allCommands().filter((c) => c.when?.() ?? true);
}

/** For tests and screens that register outside React. */
export function registerCommands(read: Registration): () => void {
	const token = {};
	registrations.set(token, read);
	changed();
	return () => {
		registrations.delete(token);
		changed();
	};
}

function signatureOf(commands: readonly Command[]): string {
	return commands
		.map((c) => [c.id, c.title, c.scope, c.keys?.join(" ") ?? ""].join("\u0000"))
		.join("\u0001");
}

/**
 * Registers a screen's commands while it is mounted. `run` and `when` are read
 * at call time from the latest render, so callers need not memoise the list.
 */
export function useRegisterCommands(commands: readonly Command[]): void {
	const ref = useRef(commands);
	ref.current = commands;
	useEffect(() => registerCommands(() => ref.current), []);
	const signature = signatureOf(commands);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the signature stands for the list's shape
	useEffect(changed, [signature]);
}

/** The key the palette shows for `id`, so a hint follows a rebind; undefined while it is not registered. */
export function useCommandKey(id: string): string | undefined {
	return useCommands().find((c) => c.id === id)?.keys?.[0];
}

/** Every registered command, re-read whenever a registration changes shape. */
export function useCommands(): Command[] {
	const current = useSyncExternalStore(subscribe, () => version);
	// biome-ignore lint/correctness/useExhaustiveDependencies: version is the store's change signal
	return useMemo(allCommands, [current]);
}
