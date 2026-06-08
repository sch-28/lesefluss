import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

/**
 * Read a persisted string-union value, falling back when it is missing, invalid,
 * or storage is unavailable (private mode / disabled storage).
 */
export function readPersistedString<T extends string>(
	key: string,
	isValid: (value: string) => value is T,
	fallback: T,
): T {
	try {
		const raw = localStorage.getItem(key);
		if (raw !== null && isValid(raw)) return raw;
	} catch {
		// storage unavailable
	}
	return fallback;
}

export function writePersistedString(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// best-effort: private mode / quota / disabled storage
	}
}

/**
 * `useState` for a string-union preference that is persisted to localStorage and
 * restored on the next launch. Local to the device (not synced).
 */
export function usePersistentString<T extends string>(
	key: string,
	isValid: (value: string) => value is T,
	fallback: T,
): [T, Dispatch<SetStateAction<T>>] {
	const [value, setValue] = useState<T>(() => readPersistedString(key, isValid, fallback));
	useEffect(() => {
		writePersistedString(key, value);
	}, [key, value]);
	return [value, setValue];
}
