import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTheme } from "../../../contexts/theme-context";
import { AnimatedNumber } from "./animated-number";
import { extractAccent } from "./cover-accent";
import { getAccentStops } from "./nivo-theme";

interface Props {
	wordsThisWeek: number;
	currentStreak: number;
	topCover: string | null;
	/** Stable id used as the accent cache key, so we don't keep ~500KB base64
	 * strings as Map keys. */
	topBookId: string | null;
	deltaVsPrev?: number | null;
}

export function Hero({ wordsThisWeek, currentStreak, topCover, topBookId, deltaVsPrev }: Props) {
	const { theme } = useTheme();
	const [accent, setAccent] = useState(() => getAccentStops(theme));

	useEffect(() => {
		let alive = true;
		const fallback = getAccentStops(theme);
		extractAccent(topCover, fallback, topBookId ?? undefined).then((stops) => {
			if (alive) setAccent(stops);
		});
		return () => {
			alive = false;
		};
	}, [topCover, topBookId, theme]);

	const reduce =
		typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

	return (
		<div className="relative mx-4 mt-3 mb-6 h-[200px] overflow-hidden rounded-2xl">
			{topCover ? (
				<motion.img
					src={topCover}
					alt=""
					aria-hidden={true}
					className="absolute inset-0 h-full w-full object-cover"
					style={{ filter: "blur(36px) saturate(1.3)" }}
					initial={{ scale: 1.4 }}
					animate={reduce ? { scale: 1.4 } : { scale: [1.4, 1.55, 1.4] }}
					transition={{ duration: 18, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				/>
			) : (
				<motion.div
					className="absolute inset-0"
					style={{
						background: `conic-gradient(from 0deg at 30% 30%, ${accent.from}, ${accent.to}, ${accent.from})`,
						filter: "blur(40px) saturate(1.2)",
					}}
					animate={reduce ? undefined : { rotate: 360 }}
					transition={{ duration: 24, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
				/>
			)}

			<div
				className="absolute inset-0 mix-blend-overlay opacity-60"
				style={{
					background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`,
				}}
			/>
			<div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/35 to-black/55" />

			<div className="relative flex h-full flex-col justify-end p-6 pb-7 text-white">
				<motion.p
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
					className="text-[11px] uppercase tracking-[0.2em] opacity-80"
				>
					This week
				</motion.p>
				<motion.div
					initial={{ opacity: 0, y: 14 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.05 }}
					className="mt-2 flex items-baseline gap-2"
				>
					<AnimatedNumber
						value={wordsThisWeek}
						className="font-bold text-5xl tabular-nums tracking-tight"
					/>
					<span className="text-base opacity-80">words</span>
				</motion.div>
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.5, delay: 0.2 }}
					className="mt-3 flex flex-wrap items-center gap-2"
				>
					<span className="rounded-full bg-white/15 px-3 py-1 font-medium text-xs backdrop-blur">
						🔥 {currentStreak}-day streak
					</span>
					{deltaVsPrev != null && (
						<span
							className={`rounded-full px-3 py-1 font-medium text-xs backdrop-blur ${
								deltaVsPrev >= 0 ? "bg-emerald-500/30" : "bg-rose-500/30"
							}`}
						>
							{deltaVsPrev >= 0 ? "▲" : "▼"} {Math.abs(Math.round(deltaVsPrev))}% vs last week
						</span>
					)}
				</motion.div>
			</div>
		</div>
	);
}
