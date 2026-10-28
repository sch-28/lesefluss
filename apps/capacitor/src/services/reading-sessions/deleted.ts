type Listener = (ids: ReadonlySet<string>) => void;

const listeners = new Set<Listener>();

/** Called with the ids of sessions deleted on another device, before their rows go. */
export function onSessionsDeleted(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function notifySessionsDeleted(ids: readonly string[]): void {
	if (ids.length === 0) return;
	const set = new Set(ids);
	for (const listener of listeners) listener(set);
}
