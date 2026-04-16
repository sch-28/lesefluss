import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ORP (Optimal Recognition Point) — focal letter index.
 * Matches calcOrpIndex from rsvp-core/engine.ts exactly.
 */
function calcOrpIndex(wordLength: number): number {
	if (wordLength <= 2) return 0;
	if (wordLength <= 5) return 1;
	if (wordLength <= 9) return 2;
	if (wordLength <= 13) return 3;
	return 4;
}

/* Opening of "The Old Man and the Sea" by Ernest Hemingway (public domain) */
const SAMPLE_TEXT =
	"He was an old man who fished alone in a skiff in the Gulf Stream and he had gone eighty-four days now without taking a fish. In the first forty days a boy had been with him. But after forty days without a fish the boy's parents had told him that the old man was now definitely and finally salao, which is the worst form of unlucky, and the boy had gone at their orders in another boat which caught three good fish the first week.";

const WORDS = SAMPLE_TEXT.split(/\s+/);
const WPM = 300;
const BASE_DELAY = 60000 / WPM; // 200ms

function getDelay(word: string): number {
	if (/[.!?]/.test(word)) return BASE_DELAY * 3.0;
	if (/[,;:]/.test(word)) return BASE_DELAY * 2.0;
	return BASE_DELAY;
}

export function RsvpPreview() {
	const [wordIndex, setWordIndex] = useState(0);
	const [isClient, setIsClient] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const indexRef = useRef(0);

	useEffect(() => {
		setIsClient(true);
	}, []);

	const schedule = useCallback(() => {
		const delay = getDelay(WORDS[indexRef.current]);
		timerRef.current = setTimeout(() => {
			const next = (indexRef.current + 1) % WORDS.length;
			indexRef.current = next;
			setWordIndex(next);
			if (next === 0) {
				// pause before looping
				timerRef.current = setTimeout(schedule, 1200);
			} else {
				schedule();
			}
		}, delay);
	}, []);

	useEffect(() => {
		if (!isClient) return;
		schedule();
		return () => clearTimeout(timerRef.current);
	}, [isClient, schedule]);

	const word = WORDS[wordIndex];
	const orp = calcOrpIndex(word.length);
	const before = word.slice(0, orp);
	const focal = word[orp];
	const after = word.slice(orp + 1);
	const progress = ((wordIndex + 1) / WORDS.length) * 100;

	return (
		/* Phone: ~9:19.5 modern aspect ratio */
		<div className="relative mx-auto" style={{ width: "220px" }}>
			{/* Phone bezel */}
			<div
				className="rounded-[2.5rem] border-[3px] border-slate-300 bg-slate-200 p-[6px] shadow-xl"
				style={{ aspectRatio: "9 / 19.5" }}
			>
				{/* Dynamic island */}
				<div className="relative z-10 mx-auto -mb-2 h-[14px] w-16 rounded-full bg-slate-800" />

				{/* Screen */}
				<div className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-white">
					{/* Status bar */}
					<div className="flex items-center justify-between px-5 pt-6 pb-1">
						<span className="font-mono text-[10px] text-slate-400 uppercase tracking-widest">
							{WPM} WPM
						</span>
						<span className="text-[10px] text-slate-400">{Math.round(progress)}%</span>
					</div>

					{/* RSVP display area — fills remaining space */}
					<div className="relative flex flex-1 items-center justify-center">
						{/* Focal indicator — top tick, fixed at screen center */}
						<div
							className="absolute left-1/2 -translate-x-1/2 bg-red-400/60"
							style={{ width: "2px", height: "6px", top: "calc(50% - 1.1rem - 6px)" }}
						/>
						{/* Word — positioned so focal letter center = screen center */}
						<span
							className="absolute whitespace-nowrap font-bold font-mono text-[1.3rem] text-slate-800"
							style={{
								left: "50%",
								transform: `translateX(calc(-1ch * ${orp + 0.5}))`,
								letterSpacing: "0.02em",
							}}
						>
							<span>{before}</span>
							<span className="text-red-500">{focal}</span>
							<span>{after}</span>
						</span>
						{/* Focal indicator — bottom tick, fixed at screen center */}
						<div
							className="absolute left-1/2 -translate-x-1/2 bg-red-400/60"
							style={{ width: "2px", height: "6px", top: "calc(50% + 1.1rem)" }}
						/>
					</div>

					{/* Progress bar */}
					<div className="px-5 pb-1.5">
						<div className="h-[3px] w-full rounded-full bg-slate-100">
							<div
								className="h-[3px] rounded-full bg-slate-300 transition-[width] duration-150"
								style={{ width: `${progress}%` }}
							/>
						</div>
					</div>

					{/* Chapter info */}
					<div className="px-5 pb-4 text-center">
						<p className="text-[10px] text-slate-400">Chapter 1 · The Old Man</p>
					</div>

					{/* Home indicator */}
					<div className="mx-auto mb-2 h-1 w-14 rounded-full bg-slate-200" />
				</div>
			</div>
		</div>
	);
}
