import { useCallback, useEffect, useRef, useState } from "react";

export const UNDO_WINDOW_MS = 6000;

type Commit = (ids: string[]) => Promise<void>;

/**
 * Hides rows at once and deletes them when the undo window closes. Leaving the
 * page closes every open window early rather than dropping the delete. A failed
 * delete shows the rows again; a landed one keeps them hidden until the refetch
 * drops them, so they never flash back.
 */
export function useUndoableDelete(commit: Commit) {
	const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
	const pending = useRef(new Map<ReturnType<typeof setTimeout>, string[]>());
	const commitRef = useRef(commit);
	commitRef.current = commit;

	const setHiddenFor = useCallback((ids: readonly string[], isHidden: boolean) => {
		setHidden((prev) => {
			const next = new Set(prev);
			for (const id of ids) {
				if (isHidden) next.add(id);
				else next.delete(id);
			}
			return next;
		});
	}, []);

	const run = useCallback(
		(ids: string[]) => {
			commitRef.current(ids).catch(() => setHiddenFor(ids, false));
		},
		[setHiddenFor],
	);

	const deleteNow = useCallback(
		(ids: string[]) => {
			setHiddenFor(ids, true);
			run(ids);
		},
		[run, setHiddenFor],
	);

	/** Returns the undo. */
	const deleteLater = useCallback(
		(ids: string[]): (() => void) => {
			setHiddenFor(ids, true);
			const timer = setTimeout(() => {
				pending.current.delete(timer);
				run(ids);
			}, UNDO_WINDOW_MS);
			pending.current.set(timer, ids);
			return () => {
				if (!pending.current.delete(timer)) return;
				clearTimeout(timer);
				setHiddenFor(ids, false);
			};
		},
		[run, setHiddenFor],
	);

	useEffect(() => {
		const open = pending.current;
		return () => {
			for (const [timer, ids] of open) {
				clearTimeout(timer);
				commitRef.current(ids).catch(() => {});
			}
			open.clear();
		};
	}, []);

	return { hidden, deleteNow, deleteLater };
}
