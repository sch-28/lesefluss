import { cn } from "@lesefluss/ui/utils";

export function Sparkline({
	points,
	className,
}: {
	points: readonly number[];
	className?: string;
}) {
	if (points.length < 2) return null;
	const min = Math.min(...points);
	const span = Math.max(1, Math.max(...points) - min);
	const step = 100 / (points.length - 1);
	const d = points.map((p, i) => `${i * step},${20 - ((p - min) / span) * 18 - 1}`).join(" ");
	return (
		<svg
			viewBox="0 0 100 20"
			preserveAspectRatio="none"
			className={cn("h-4 w-full", className)}
			aria-hidden="true"
		>
			<polyline
				points={d}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				vectorEffect="non-scaling-stroke"
				className="text-primary"
			/>
		</svg>
	);
}
