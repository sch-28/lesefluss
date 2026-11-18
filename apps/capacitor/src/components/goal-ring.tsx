import { Check } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
	size: number;
	/** 0 to 1, capped by the caller. */
	fraction: number;
	isMet?: boolean;
	children?: ReactNode;
	className?: string;
	/** Replaces the reader's track colour where the ring sits on app chrome. */
	trackClassName?: string;
};

/** The goal chip's ring at any size, with an optional label in its middle; a met ring with no
 *  label shows a check, so a full ring never reads as an empty circle. */
export function GoalRing({
	size,
	fraction,
	isMet = false,
	children,
	className,
	trackClassName = "reader-goal-ring-track",
}: Props) {
	const stroke = Math.max(2, size / 10);
	const radius = (size - stroke) / 2;
	const length = 2 * Math.PI * radius;
	const center = size / 2;
	const label =
		children != null && children !== false ? (
			children
		) : isMet ? (
			<Check
				data-testid="goal-ring-check"
				className="text-[var(--goal-met)]"
				style={{ width: size * 0.45, height: size * 0.45 }}
				strokeWidth={2.5}
			/>
		) : null;
	return (
		<span
			className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ""}`}
			style={{ width: size, height: size }}
		>
			<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
				<circle
					cx={center}
					cy={center}
					r={radius}
					fill="none"
					className={trackClassName}
					strokeWidth={stroke}
				/>
				{fraction > 0 && (
					<circle
						cx={center}
						cy={center}
						r={radius}
						fill="none"
						className="reader-goal-ring"
						style={isMet ? { stroke: "var(--goal-met)" } : undefined}
						strokeWidth={stroke}
						strokeLinecap="round"
						strokeDasharray={`${Math.min(1, Math.max(0, fraction)) * length} ${length}`}
						transform={`rotate(-90 ${center} ${center})`}
					/>
				)}
			</svg>
			{label != null && (
				// ui-rules-allow: font-size -- sized to fit inside the fixed-size ring
				<span className="absolute inset-0 flex items-center justify-center font-semibold text-[0.5625rem] tabular-nums">
					{label}
				</span>
			)}
		</span>
	);
}
