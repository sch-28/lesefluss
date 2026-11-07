import { useEffect, useState } from "react";

const SCALE_MAX = 800;
const CX = 150;
const CY = 160;
const R = 120;
const ARC = `M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`;
const TICKS = Array.from({ length: SCALE_MAX / 50 + 1 }, (_, i) => i * 50);

function point(value: number, radius: number): [number, number] {
	const angle = Math.PI * (1 + Math.min(value, SCALE_MAX) / SCALE_MAX);
	return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];
}

function dash(value: number): string {
	return `${Math.max(0, Math.min(value, SCALE_MAX))} ${SCALE_MAX}`;
}

interface Props {
	/** Drawn in the text colour. */
	reading?: number | null;
	/** Drawn on from `reading` in the brand colour. */
	dial?: number | null;
	value: string;
	label: string;
	animate?: boolean;
}

/** A 0–800 wpm half dial: reading speed in the text colour, the RSVP dial past it. */
export function SpeedGauge({ reading, dial, value, label, animate = true }: Props) {
	const [drawn, setDrawn] = useState(!animate);
	useEffect(() => {
		if (!animate) return;
		const frame = requestAnimationFrame(() => setDrawn(true));
		return () => cancelAnimationFrame(frame);
	}, [animate]);
	const transition = animate ? "stroke-dasharray 0.9s ease-out" : undefined;

	return (
		<svg viewBox="0 0 300 180" className="mx-auto block w-full max-w-[300px]" aria-hidden="true">
			<path
				d={ARC}
				fill="none"
				stroke="var(--muted)"
				strokeWidth={14}
				strokeLinecap="round"
				pathLength={SCALE_MAX}
			/>
			{dial != null && (
				<path
					d={ARC}
					fill="none"
					stroke="var(--primary)"
					strokeWidth={14}
					strokeLinecap="round"
					pathLength={SCALE_MAX}
					strokeDasharray={dash(drawn ? dial : 0)}
					style={{ transition, transitionDelay: animate ? "0.6s" : undefined }}
					data-testid="gauge-dial"
				/>
			)}
			{reading != null && (
				<path
					d={ARC}
					fill="none"
					stroke="var(--foreground)"
					strokeWidth={14}
					strokeLinecap="round"
					pathLength={SCALE_MAX}
					strokeDasharray={dash(drawn ? reading : 0)}
					style={{ transition }}
					data-testid="gauge-reading"
				/>
			)}
			{TICKS.map((tick) => {
				const major = tick % 200 === 0;
				const [x1, y1] = point(tick, R - 12);
				const [x2, y2] = point(tick, R - (major ? 22 : 17));
				const [lx, ly] = point(tick, R - 34);
				return (
					<g key={tick}>
						<line
							x1={x1}
							y1={y1}
							x2={x2}
							y2={y2}
							stroke="var(--muted-foreground)"
							strokeWidth={major ? 1.5 : 1}
							opacity={major ? 0.8 : 0.4}
						/>
						{major && (
							<text
								x={lx}
								y={ly}
								textAnchor="middle"
								dominantBaseline="middle"
								fontSize={10}
								fill="var(--muted-foreground)"
							>
								{tick}
							</text>
						)}
					</g>
				);
			})}
			<text
				x={CX}
				y={CY - 22}
				textAnchor="middle"
				fontSize={40}
				fontWeight={700}
				fill="var(--foreground)"
				className="tabular-nums"
			>
				{value}
			</text>
			<text x={CX} y={CY + 2} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
				{label}
			</text>
		</svg>
	);
}
