/**
 * Full-area overlay shown while the reading session is manually paused
 * (two-finger tap). Rendered as the last child of the reader view container
 * (`absolute inset-0`, DOM-order layering) so it covers the active view and
 * the progress bar; the header above the container stays usable.
 *
 * Activation is ignored for a grace period after mount: the browser may
 * synthesize a trailing click from the very touch sequence that opened the
 * overlay, which would otherwise resume immediately.
 */
import { Pause } from "lucide-react";
import { useRef } from "react";

const RESUME_GRACE_MS = 350;

type Props = {
	onResume: () => void;
};

export function SessionPauseOverlay({ onResume }: Props) {
	const mountedAtRef = useRef(Date.now());

	return (
		<div
			className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 p-6 text-center backdrop-blur-sm"
			data-testid="session-pause-overlay"
			onPointerDownCapture={(e) => e.stopPropagation()}
			onClickCapture={(e) => {
				e.stopPropagation();
				if (Date.now() - mountedAtRef.current < RESUME_GRACE_MS) return;
				onResume();
			}}
		>
			<Pause className="size-10 opacity-60" aria-hidden />
			<p className="text-base">Reading paused</p>
			<p className="text-sm opacity-60">Tap to resume</p>
		</div>
	);
}
