import { useEffect, useRef, useSyncExternalStore } from "react";

/** A boolean any module can set and any component can watch. */
export function createFlag(initial = false) {
	let value = initial;
	const listeners = new Set<() => void>();
	const set = (next: boolean) => {
		if (next === value) return;
		value = next;
		for (const listener of listeners) listener();
	};
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};
	return {
		get: () => value,
		set,
		subscribe,
		useValue: () => useSyncExternalStore(subscribe, () => value),
	};
}

/**
 * A request that waits for its handler: raised before the screen that answers it
 * has mounted, it is answered on mount.
 */
export function createRequest() {
	const pending = createFlag();
	return {
		raise: () => pending.set(true),
		useHandler(onRequest: () => void) {
			const ref = useRef(onRequest);
			ref.current = onRequest;
			const isPending = pending.useValue();
			useEffect(() => {
				if (!isPending) return;
				pending.set(false);
				ref.current();
			}, [isPending]);
		},
	};
}
