import { useCallback, useMemo, useState } from "react";
import { readPersistedString, writePersistedString } from "../../hooks/use-persistent-string";
import { type GroupBy, parseCollapsed, toggleCollapsed } from "./group-by";

const COLLAPSED_KEY = "lesefluss:library-collapsed";
const anyString = (_value: string): _value is string => true;

/**
 * Which groups are folded, kept on this device per grouping. Not
 * `usePersistentString`: its key is read once, and switching the grouping
 * would carry one grouping's folds into the next.
 */
export function useCollapsedGroups(
	groupBy: GroupBy,
): [collapsed: ReadonlySet<string>, toggle: (groupKey: string) => void] {
	const key = `${COLLAPSED_KEY}:${groupBy}`;
	const [written, setWritten] = useState<Record<string, string>>({});
	const raw = written[key] ?? readPersistedString(key, anyString, "[]");
	const collapsed = useMemo(() => parseCollapsed(raw), [raw]);
	const toggle = useCallback(
		(groupKey: string) =>
			setWritten((current) => {
				const next = toggleCollapsed(
					current[key] ?? readPersistedString(key, anyString, "[]"),
					groupKey,
				);
				writePersistedString(key, next);
				return { ...current, [key]: next };
			}),
		[key],
	);
	return [collapsed, toggle];
}
