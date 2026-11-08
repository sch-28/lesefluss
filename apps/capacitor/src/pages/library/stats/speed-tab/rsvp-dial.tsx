import type { SpeedModel } from "@lesefluss/core";
import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { queryHooks } from "../../../../services/db/hooks";
import { clampToRange, RSVP_WPM_RANGE, steppedWpm } from "../../../reader/wpm";

/** The gauge's own span: the full dial range would squeeze every real setting into one corner. */
export const GAUGE_MIN = 200;
export const GAUGE_MAX = 600;

const SIZE = 220;
const STROKE = 14;
// Inset so the knob, wider than the ring, stays inside the view box.
const R = SIZE / 2 - STROKE * 1.1;
const CX = SIZE / 2;
const CY = SIZE / 2;
// A 240° arc open at the bottom, from the lower left round to the lower right.
const START_DEG = 150;
const SWEEP_DEG = 240;

function fractionOf(wpm: number): number {
	return Math.min(1, Math.max(0, (wpm - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)));
}

function pointAt(fraction: number): { x: number; y: number } {
	const rad = ((START_DEG + fraction * SWEEP_DEG) * Math.PI) / 180;
	return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

function arcPath(from: number, to: number): string {
	const a = pointAt(from);
	const b = pointAt(to);
	const large = (to - from) * SWEEP_DEG > 180 ? 1 : 0;
	return `M ${a.x} ${a.y} A ${R} ${R} 0 ${large} 1 ${b.x} ${b.y}`;
}

/** Whether (x, y) lies on the ring, give or take a finger, so a tap beside it changes nothing. */
export function onRing(x: number, y: number): boolean {
	return Math.abs(Math.hypot(x - CX, y - CY) - R) <= STROKE * 1.5;
}

/** The dial a pointer at (x, y) on the gauge picks, stepped and clamped; null in the open gap. */
export function wpmAtPoint(x: number, y: number): number | null {
	let deg = (Math.atan2(y - CY, x - CX) * 180) / Math.PI;
	if (deg < 0) deg += 360;
	let along = deg - START_DEG;
	if (along < 0) along += 360;
	if (along > SWEEP_DEG) {
		// The gap under the gauge: snap to whichever end is nearer.
		along = along - SWEEP_DEG < (360 - SWEEP_DEG) / 2 ? SWEEP_DEG : 0;
	}
	const raw = GAUGE_MIN + (along / SWEEP_DEG) * (GAUGE_MAX - GAUGE_MIN);
	const stepped = Math.round(raw / RSVP_WPM_RANGE.step) * RSVP_WPM_RANGE.step;
	return clampToRange(stepped, RSVP_WPM_RANGE);
}

export function deliveredPercent(ratio: number): number {
	return Math.min(100, Math.round(ratio * 100));
}

export function RsvpDial({ model }: { model: SpeedModel }) {
	const settings = queryHooks.useSettings();
	const save = queryHooks.useSaveSettings();
	const saved = settings.data?.wpm ?? model.rsvp?.dialWpm ?? RSVP_WPM_RANGE.min;
	// Local so a drag and quick taps move at once, not after the save is re-read.
	const [dial, setDial] = useState(saved);
	useEffect(() => setDial(saved), [saved]);
	const dragging = useRef(false);
	const svgRef = useRef<SVGSVGElement>(null);

	const delivered = model.rsvp?.wpm ?? 0;
	const ratio = model.rsvp?.deliveredRatio ?? null;

	const commit = (next: number) => {
		if (next !== saved) save.mutate({ wpm: next });
	};
	const step = (direction: 1 | -1) => {
		const next = steppedWpm(dial, RSVP_WPM_RANGE, direction);
		if (next === dial) return;
		setDial(next);
		commit(next);
	};
	const pointOf = (e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } | null => {
		const rect = svgRef.current?.getBoundingClientRect();
		if (!rect || rect.width === 0) return null;
		const scale = SIZE / rect.width;
		return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
	};
	const fromPointer = (e: React.PointerEvent<SVGSVGElement>): number | null => {
		const p = pointOf(e);
		return p ? wpmAtPoint(p.x, p.y) : null;
	};

	const knob = pointAt(fractionOf(dial));
	return (
		<section className="mb-8 px-4" data-testid="rsvp-dial">
			<div className="mx-auto w-full max-w-[240px]">
				<svg
					ref={svgRef}
					viewBox={`0 0 ${SIZE} ${SIZE * 0.86}`}
					className="w-full select-none"
					// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the arc is the control; a range input cannot take its shape
					role="slider"
					aria-label="RSVP dial"
					aria-valuemin={RSVP_WPM_RANGE.min}
					aria-valuemax={RSVP_WPM_RANGE.max}
					aria-valuenow={dial}
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === "ArrowRight" || e.key === "ArrowUp") step(1);
						if (e.key === "ArrowLeft" || e.key === "ArrowDown") step(-1);
					}}
					onPointerDown={(e) => {
						const p = pointOf(e);
						if (!p || !onRing(p.x, p.y)) return;
						dragging.current = true;
						e.currentTarget.setPointerCapture(e.pointerId);
						const next = fromPointer(e);
						if (next !== null) setDial(next);
					}}
					onPointerMove={(e) => {
						if (!dragging.current) return;
						const next = fromPointer(e);
						if (next !== null) setDial(next);
					}}
					onPointerUp={(e) => {
						if (!dragging.current) return;
						dragging.current = false;
						commit(fromPointer(e) ?? dial);
					}}
					onPointerCancel={() => {
						dragging.current = false;
						setDial(saved);
					}}
				>
					<path
						d={arcPath(0, 1)}
						fill="none"
						stroke="currentColor"
						strokeOpacity={0.12}
						strokeWidth={STROKE}
						strokeLinecap="round"
					/>
					{/* Only the ring holds the page still under a drag; a scroll beside it still scrolls. */}
					<path
						d={arcPath(0, 1)}
						fill="none"
						stroke="transparent"
						strokeWidth={STROKE * 3}
						className="touch-none"
					/>
					{delivered > 0 && (
						<path
							d={arcPath(0, Math.max(0.001, fractionOf(delivered)))}
							fill="none"
							stroke="var(--primary)"
							strokeWidth={STROKE}
							strokeLinecap="round"
						/>
					)}
					<circle
						cx={knob.x}
						cy={knob.y}
						r={STROKE * 0.9}
						fill="var(--background)"
						stroke="currentColor"
						strokeWidth={3}
					/>
					<text
						x={CX}
						y={CY - 6}
						textAnchor="middle"
						className="fill-current font-bold text-[34px] tabular-nums"
					>
						{dial}
					</text>
					<text
						x={CX}
						y={CY + 18}
						textAnchor="middle"
						className="fill-current text-[12px] opacity-60"
					>
						dial wpm
					</text>
				</svg>
			</div>
			<div className="mt-1 flex items-center justify-center gap-3">
				<button
					type="button"
					aria-label={`Dial −${RSVP_WPM_RANGE.step}`}
					disabled={dial <= RSVP_WPM_RANGE.min}
					onClick={() => step(-1)}
					className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40"
				>
					<Minus className="size-4" />
				</button>
				<button
					type="button"
					aria-label={`Dial +${RSVP_WPM_RANGE.step}`}
					disabled={dial >= RSVP_WPM_RANGE.max}
					onClick={() => step(1)}
					className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40"
				>
					<Plus className="size-4" />
				</button>
			</div>
			<p
				className="mt-2 text-center text-muted-foreground text-xs tabular-nums"
				data-testid="dial-line"
			>
				Global dial {dial} wpm{ratio !== null ? `, ${deliveredPercent(ratio)}% delivered` : ""}
			</p>
		</section>
	);
}
