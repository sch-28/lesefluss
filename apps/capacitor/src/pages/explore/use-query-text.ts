import { useEffect, useRef, useState } from "react";
import { useDebounced } from "../../utils/use-debounced";

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * A search box mirrored into a `q` URL param. Typing debounces into the URL;
 * URL changes the box did not cause (back, a recent search) refill the box.
 *
 * The last value written is remembered so that the URL catching up to an
 * older keystroke ("dun" landing while the box already says "dune") is not
 * mistaken for an outside change that should overwrite the box.
 */
export function useQueryText(
	urlQ: string | undefined,
	commit: (q: string) => void,
	debounceMs = DEFAULT_DEBOUNCE_MS,
) {
	const [text, setText] = useState(urlQ ?? "");
	const [lastUrlQ, setLastUrlQ] = useState(urlQ);
	const lastWrittenRef = useRef(urlQ ?? "");

	if (urlQ !== lastUrlQ) {
		setLastUrlQ(urlQ);
		const incoming = urlQ ?? "";
		if (incoming !== lastWrittenRef.current && incoming !== text.trim()) {
			lastWrittenRef.current = incoming;
			setText(incoming);
		}
	}

	const debounced = useDebounced(text.trim(), debounceMs);
	const commitRef = useRef(commit);
	commitRef.current = commit;
	useEffect(() => {
		if (debounced === lastWrittenRef.current) return;
		lastWrittenRef.current = debounced;
		commitRef.current(debounced);
	}, [debounced]);

	/** Set the box and the URL at once, skipping the debounce (Enter, recents, clear). */
	const submit = (q: string) => {
		const trimmed = q.trim();
		setText(q);
		lastWrittenRef.current = trimmed;
		commitRef.current(trimmed);
	};

	return { text, setText, submit };
}
