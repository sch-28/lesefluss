/**
 * Secondary-side IPC.
 *
 * The secondary WebView has no Capacitor bridge (Option C from the plan), so
 * we talk to the Java plugin through two lightweight globals:
 *
 *   window.__DualScreen.__onState(snapshot)  ← injected by Java via
 *                                              evaluateJavascript on each
 *                                              DualScreen.pushState() call.
 *   window.__DualScreenNative.markReady()    → tells Java we're listening
 *                                              (replays last snapshot).
 *   window.__DualScreenNative.command(json)  → forwards a command to the
 *                                              primary's plugin event channel.
 */

import type { DualScreenSnapshot } from "../services/dual-screen";

type Listener = (snap: DualScreenSnapshot) => void;

const listeners = new Set<Listener>();
let last: DualScreenSnapshot | null = null;
let initialized = false;

interface NativeBridge {
	markReady(): void;
	command(json: string): void;
}

function getNative(): NativeBridge | null {
	return (window as unknown as { __DualScreenNative?: NativeBridge }).__DualScreenNative ?? null;
}

function ensureInit() {
	if (initialized) return;
	initialized = true;
	(window as unknown as { __DualScreen?: unknown }).__DualScreen = {
		__onState(snap: DualScreenSnapshot) {
			last = snap;
			for (const fn of listeners) fn(snap);
		},
	};
	getNative()?.markReady();
}

export function subscribeSnapshot(fn: Listener): () => void {
	ensureInit();
	listeners.add(fn);
	if (last) fn(last);
	return () => {
		listeners.delete(fn);
	};
}

export function sendCommand(cmd: { kind: string } & Record<string, unknown>): void {
	const native = getNative();
	if (!native) return;
	try {
		native.command(JSON.stringify(cmd));
	} catch (e) {
		console.warn("[Lesefluss][secondary] sendCommand failed", e);
	}
}
