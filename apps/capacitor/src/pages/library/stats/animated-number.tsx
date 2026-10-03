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
 * Animated count-up. Eases from previous render to current `value` over
 * `durationMs`. Snaps instantly under reduced motion or e-ink mode.
 */
export function AnimatedNumber({ value, durationMs = 800, format, className }: Props) {
	const mv = useMotionValue(0);
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
