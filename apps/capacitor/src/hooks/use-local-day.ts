import { useEffect, useState } from "react";
import { startOfLocalDay } from "../utils/date-utils";

const DAY_MS = 86_400_000;

/**
 * A timestamp that stays put within a local day and moves on to the new day
 * at midnight, or on return to the app after it: day-scoped queries key on it,
 * so an app left open overnight does not keep showing yesterday.
 */
export function useLocalDayNow(): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const roll = () =>
			setNow((current) =>
				startOfLocalDay(current) === startOfLocalDay(Date.now()) ? current : Date.now(),
			);
		const onVisible = () => {
			if (document.visibilityState !== "hidden") roll();
		};
		// 36h past this midnight always lands in the next day, DST or not.
		const nextMidnight = startOfLocalDay(startOfLocalDay(now) + 1.5 * DAY_MS);
		const timer = setTimeout(roll, nextMidnight - Date.now() + 1000);
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [now]);
	return now;
}
