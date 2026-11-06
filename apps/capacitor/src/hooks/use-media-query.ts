import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
	useEffect(() => {
		const mq = window.matchMedia?.(query);
		if (!mq) return;
		setMatches(mq.matches);
		const onChange = () => setMatches(mq.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [query]);
	return matches;
}
