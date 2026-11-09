import { usePrefersReducedMotion } from "@lesefluss/ui/use-prefers-reduced-motion";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";

interface Props {
	value: number;
	durationMs?: number;
	format?: (n: number) => string;
	className?: string;
}

/**
 * Eases from the previous `value` to the current one over `durationMs`.
 * Starts at the first value, not 0: a total that counts up on load reads as a
 * wrong number first. Snaps instantly under reduced motion or e-ink mode.
 */
export function AnimatedNumber({ value, durationMs = 800, format, className }: Props) {
	const mv = useMotionValue(value);
	const display = useTransform(mv, (v) => (format ? format(v) : Math.round(v).toLocaleString()));

	const isReducedMotion = usePrefersReducedMotion();

	useEffect(() => {
		if (isReducedMotion) {
			mv.set(value);
			return;
		}
		const controls = animate(mv, value, {
			duration: durationMs / 1000,
			ease: [0.16, 1, 0.3, 1],
		});
		return () => controls.stop();
	}, [value, durationMs, mv, isReducedMotion]);

	return <motion.span className={className}>{display}</motion.span>;
}
