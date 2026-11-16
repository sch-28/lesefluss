import { toast as sonnerToast } from "@lesefluss/ui/sonner";
import { usePrefersReducedMotion } from "@lesefluss/ui/use-prefers-reduced-motion";
import { motion } from "framer-motion";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { confirmTick } from "../services/haptics";

export type ToastCardKind = "success" | "danger" | "warning" | "info" | "loading" | "wishlist";

export interface ToastCardAction {
	label: string;
	onClick: () => void;
}

export interface ToastCardContent {
	kind: ToastCardKind;
	message: string;
	action?: ToastCardAction;
	/** Milliseconds; Infinity stays until replaced or dismissed. */
	duration: number;
	/** Bumped on every emit, so a toast replaced under the same id restarts its timer. */
	version: number;
}

const TICK_MS = 100;

const emittedVersion = new Map<string | number, number>();

/**
 * Records an emit under an explicit id. A tapped action that shows its own toast
 * again (Retry) must keep it: sonner applies a dismiss frames later, to whatever
 * then holds the id.
 */
export function recordEmit(id: string, version: number) {
	emittedVersion.set(id, version);
}
/** How long a finished loading bar fills and fades before the result shows. */
export const COMPLETE_MS = 320;

const KIND_COLOR: Record<ToastCardKind, string> = {
	success: "var(--toast-ok)",
	danger: "var(--destructive)",
	warning: "var(--toast-warn)",
	info: "var(--primary)",
	loading: "var(--primary)",
	wishlist: "var(--primary)",
};

function useCountdown(duration: number, restartKey: number, onEnd: () => void) {
	const [left, setLeft] = useState(duration);
	const pausedRef = useRef(false);
	const onEndRef = useRef(onEnd);
	onEndRef.current = onEnd;

	// biome-ignore lint/correctness/useExhaustiveDependencies: restartKey restarts the countdown on purpose.
	useEffect(() => {
		setLeft(duration);
		if (!Number.isFinite(duration)) return;
		let remaining = duration;
		let last = Date.now();
		const id = setInterval(() => {
			const now = Date.now();
			if (!pausedRef.current && !document.hidden) remaining -= now - last;
			last = now;
			setLeft(Math.max(0, remaining));
			if (remaining <= 0) {
				clearInterval(id);
				onEndRef.current();
			}
		}, TICK_MS);
		return () => clearInterval(id);
	}, [duration, restartKey]);

	return { left, pausedRef };
}

/**
 * The card a toast shows. A loading card replaced by its result under the same
 * id lets its bar finish first, then shows the result.
 */
export function ToastCard({
	toastId,
	content,
}: {
	toastId: string | number;
	content: ToastCardContent;
}) {
	const reduced = usePrefersReducedMotion();
	const [shown, setShown] = useState(content);
	const [completing, setCompleting] = useState(false);
	const latest = useRef(content);
	latest.current = content;

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new version is the only change that counts; latest holds its content.
	useEffect(() => {
		const next = latest.current;
		if (next.version === shown.version) return;
		const finishesLoading =
			shown.kind === "loading" && next.kind !== "loading" && next.kind !== "danger";
		if (!finishesLoading || reduced) {
			setShown(next);
			return;
		}
		setCompleting(true);
		const t = setTimeout(() => {
			setCompleting(false);
			setShown(latest.current);
		}, COMPLETE_MS);
		return () => clearTimeout(t);
	}, [content.version]);

	const { left, pausedRef } = useCountdown(shown.duration, shown.version, () =>
		sonnerToast.dismiss(toastId),
	);
	const hold = useRef({ hover: false, press: false, focus: false });
	const setHold = (key: "hover" | "press" | "focus", on: boolean) => {
		hold.current[key] = on;
		pausedRef.current = hold.current.hover || hold.current.press || hold.current.focus;
	};
	const pillRef = useRef<HTMLDivElement>(null);

	// A focused button that a new version drops fires no blur, which would hold the countdown forever.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs per shown version.
	useEffect(() => {
		if (!pillRef.current?.contains(document.activeElement)) setHold("focus", false);
	}, [shown.version]);

	const isUndo = shown.action?.label === "Undo" && Number.isFinite(shown.duration);
	const style = { "--c": KIND_COLOR[shown.kind] } as CSSProperties;

	return (
		<div
			ref={pillRef}
			className="toast-pill"
			data-kind={shown.kind}
			data-testid="toast-card"
			style={style}
			onPointerEnter={() => setHold("hover", true)}
			onPointerLeave={() => setHold("hover", false)}
			onPointerDown={() => setHold("press", true)}
			onPointerUp={() => setHold("press", false)}
			onPointerCancel={() => setHold("press", false)}
			onFocus={() => setHold("focus", true)}
			onBlur={() => setHold("focus", false)}
		>
			{isUndo ? (
				<UndoRing left={left} total={shown.duration} />
			) : (
				shown.kind !== "loading" && (
					<ToastIcon key={shown.version} kind={shown.kind} reduced={reduced} />
				)
			)}
			<p className="toast-message">{shown.message}</p>
			{shown.action && (
				<button
					type="button"
					className="toast-action"
					onClick={() => {
						const action = shown.action;
						if (action?.label === "Undo") confirmTick();
						const before = emittedVersion.get(toastId);
						action?.onClick();
						if (emittedVersion.get(toastId) === before) sonnerToast.dismiss(toastId);
					}}
				>
					{shown.action.label}
				</button>
			)}
			{shown.kind === "loading" && <LoadingBar completing={completing} />}
		</div>
	);
}

function LoadingBar({ completing }: { completing: boolean }) {
	return (
		<span className="toast-bar" aria-hidden data-testid="toast-loading-bar">
			{completing ? (
				<span className="toast-bar-fill toast-bar-fill--done" data-testid="toast-bar-done" />
			) : (
				<span className="toast-bar-fill animate-[indeterminate-progress_1.1s_ease-in-out_infinite]" />
			)}
		</span>
	);
}

const RING_R = 13;
const RING_C = 2 * Math.PI * RING_R;

function UndoRing({ left, total }: { left: number; total: number }) {
	const seconds = Math.ceil(left / 1000);
	return (
		<span className="toast-icon toast-ring" aria-hidden data-testid="toast-undo-ring">
			<svg viewBox="0 0 32 32" className="size-8 -rotate-90" aria-hidden="true">
				<circle cx="16" cy="16" r={RING_R} className="toast-ring-track" />
				<circle
					cx="16"
					cy="16"
					r={RING_R}
					className="toast-ring-fill"
					strokeDasharray={RING_C}
					strokeDashoffset={RING_C * (1 - left / total)}
				/>
			</svg>
			<span className="toast-ring-seconds" data-testid="toast-undo-seconds">
				{seconds}
			</span>
		</span>
	);
}

const DRAW = { duration: 0.34, delay: 0.14, ease: "easeOut" } as const;

function DrawnPath({ d, reduced, delay = 0 }: { d: string; reduced: boolean; delay?: number }) {
	return (
		<motion.path
			d={d}
			initial={reduced ? false : { pathLength: 0 }}
			animate={{ pathLength: 1 }}
			transition={reduced ? { duration: 0 } : { ...DRAW, delay: DRAW.delay + delay }}
		/>
	);
}

const ICON_PATHS: Record<"success" | "danger" | "warning" | "info", string[]> = {
	success: ["M6.5 12.5l3.6 3.6L17.5 8.5"],
	danger: ["M8 8l8 8", "M16 8l-8 8"],
	warning: ["M12 7.5v5.5", "M12 16.5h.01"],
	info: ["M12 11v5.5", "M12 7.5h.01"],
};

const HEART =
	"M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z";
const SPARK_ANGLES = [0, 60, 120, 180, 240, 300];

function ToastIcon({
	kind,
	reduced,
}: {
	kind: Exclude<ToastCardKind, "loading">;
	reduced: boolean;
}) {
	const pop = reduced
		? undefined
		: ({
				initial: { scale: 0.4 },
				animate: { scale: 1 },
				transition: { type: "spring", stiffness: 520, damping: 18 },
			} as const);
	if (kind === "wishlist") {
		return (
			<span className="toast-icon" aria-hidden data-testid="toast-icon" data-icon={kind}>
				<motion.svg
					viewBox="0 0 24 24"
					className="toast-heart size-[18px]"
					initial={reduced ? false : { scale: 0 }}
					animate={reduced ? undefined : { scale: [0, 1.28, 0.9, 1.05, 1] }}
					transition={{ duration: 0.5, ease: "easeOut" }}
				>
					<path d={HEART} />
				</motion.svg>
				{!reduced &&
					SPARK_ANGLES.map((deg) => (
						<span key={deg} className="toast-spark-arm" style={{ transform: `rotate(${deg}deg)` }}>
							<motion.span
								className="toast-spark"
								data-testid="toast-spark"
								initial={{ y: 0, opacity: 1, scale: 1 }}
								animate={{ y: -15, opacity: 0, scale: 0.4 }}
								transition={{ duration: 0.5, delay: 0.12, ease: "easeOut" }}
							/>
						</span>
					))}
			</span>
		);
	}
	const paths = ICON_PATHS[kind];
	const svg = (
		<svg viewBox="0 0 24 24" className="toast-stroke size-[18px]" aria-hidden="true">
			{paths.map((d, i) => (
				<DrawnPath key={d} d={d} reduced={reduced} delay={kind === "danger" ? i * 0.16 : 0} />
			))}
		</svg>
	);
	return (
		<motion.span
			className="toast-icon"
			aria-hidden
			data-testid="toast-icon"
			data-icon={kind}
			{...pop}
		>
			{kind === "danger" && !reduced ? (
				<motion.span
					className="flex"
					animate={{ x: [0, -7, 6, -3, 0] }}
					transition={{ duration: 0.38, delay: 0.48, ease: "easeInOut" }}
				>
					{svg}
				</motion.span>
			) : (
				svg
			)}
		</motion.span>
	);
}
