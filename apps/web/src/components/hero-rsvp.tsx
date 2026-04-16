import { useCallback, useEffect, useRef, useState } from "react";

const WORDS = ["faster", "smarter", "anywhere", "offline", "freely"];
const DELAY = 1800;

export function HeroRsvp() {
	const [index, setIndex] = useState(0);
	const [isClient, setIsClient] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const indexRef = useRef(0);

	useEffect(() => {
		setIsClient(true);
	}, []);

	const schedule = useCallback(() => {
		timerRef.current = setTimeout(() => {
			const next = (indexRef.current + 1) % WORDS.length;
			indexRef.current = next;
			setIndex(next);
			schedule();
		}, DELAY);
	}, []);

	useEffect(() => {
		if (!isClient) return;
		schedule();
		return () => clearTimeout(timerRef.current);
	}, [isClient, schedule]);

	const word = WORDS[index];

	return (
		<span key={word} className="inline-block animate-[heroFade_0.3s_ease-out] text-primary">
			{word}
		</span>
	);
}
