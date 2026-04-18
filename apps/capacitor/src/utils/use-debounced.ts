import { useEffect, useState } from "react";

/**
 * Returns `value` after it has remained stable for `delayMs`.
 * Typing freely into a search box without firing a request on every keystroke.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
	const [v, setV] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setV(value), delayMs);
		return () => clearTimeout(t);
	}, [value, delayMs]);
	return v;
}
