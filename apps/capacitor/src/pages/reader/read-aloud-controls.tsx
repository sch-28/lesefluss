import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import {
	AudioLines,
	BookOpen,
	Moon,
	Pause,
	Play,
	SkipBack,
	SkipForward,
	Undo2,
	X,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import type { SleepTimer } from "../../services/tts";
import type { ReadAloudStatus } from "./use-read-aloud";

const { min: MIN_WPM, max: MAX_WPM, step: WPM_STEP } = SETTING_CONSTRAINTS.TTS_WPM;

interface Props {
	status: ReadAloudStatus;
	wpm: number;
	/** What the voice actually manages, once measured; it can trail the target at the engine's limits. */
	measuredWpm: number | null;
	sleepTimer: SleepTimer;
	isFollowing: boolean;
	onTogglePlay: () => void;
	onSkip: (direction: 1 | -1) => void;
	onWpmChange: (wpm: number) => void;
	onOpenSleepTimer: () => void;
	onOpenVoice: () => void;
	onStop: () => void;
	onBackToVoice: () => void;
	onReadFromView: () => void;
}

const stopPropagation = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

export function ReadAloudControls({
	status,
	wpm,
	measuredWpm,
	sleepTimer,
	isFollowing,
	onTogglePlay,
	onSkip,
	onWpmChange,
	onOpenSleepTimer,
	onOpenVoice,
	onStop,
	onBackToVoice,
	onReadFromView,
}: Props) {
	const isPlaying = status === "playing";
	const sleepLabel = useSleepLabel(sleepTimer);
	return (
		<div className="read-aloud-controls" onClick={stopPropagation} onPointerDown={stopPropagation}>
			{!isFollowing && (
				<fieldset className="read-aloud-detached" aria-label="Not following the voice">
					<button type="button" onClick={onBackToVoice}>
						<Undo2 aria-hidden />
						<span>Back to voice</span>
					</button>
					<span className="reader-browse-bar-divider" aria-hidden />
					<button type="button" onClick={onReadFromView}>
						<BookOpen aria-hidden />
						<span>Read aloud from here</span>
					</button>
				</fieldset>
			)}
			<div className="rsvp-controls-row">
				<Button
					variant="ghost"
					size="icon"
					onClick={() => onSkip(-1)}
					aria-label="Previous sentence"
				>
					<SkipBack />
				</Button>
				<button
					type="button"
					className="rsvp-playpause"
					onClick={onTogglePlay}
					aria-label={isPlaying ? "Pause reading aloud" : "Resume reading aloud"}
				>
					{isPlaying ? <Pause className="size-6" /> : <Play className="size-6" />}
				</button>
				<Button variant="ghost" size="icon" onClick={() => onSkip(1)} aria-label="Next sentence">
					<SkipForward />
				</Button>
			</div>
			<div className="rsvp-wpm-stepper">
				<Button
					variant="ghost"
					size="icon"
					onClick={onOpenSleepTimer}
					aria-label={sleepLabel ? `Sleep timer, ${sleepLabel}` : "Sleep timer"}
					className={cn(sleepLabel && "w-auto gap-1 px-2 text-primary")}
				>
					<Moon />
					{sleepLabel && <span className="text-xs tabular-nums">{sleepLabel}</span>}
				</Button>
				<button
					type="button"
					className="rsvp-wpm-btn"
					onClick={() => onWpmChange(Math.max(MIN_WPM, wpm - WPM_STEP))}
					aria-label="Slower"
				>
					−
				</button>
				<span className="read-aloud-wpm">
					<span className="rsvp-wpm-value">{wpm}</span>
					<span className="rsvp-wpm-label">
						{measuredWpm !== null && Math.abs(measuredWpm - wpm) >= WPM_STEP
							? `now ${measuredWpm}`
							: "wpm"}
					</span>
				</span>
				<button
					type="button"
					className="rsvp-wpm-btn"
					onClick={() => onWpmChange(Math.min(MAX_WPM, wpm + WPM_STEP))}
					aria-label="Faster"
				>
					+
				</button>
				<Button variant="ghost" size="icon" onClick={onOpenVoice} aria-label="Voice">
					<AudioLines />
				</Button>
				<Button variant="ghost" size="icon" onClick={onStop} aria-label="Stop reading aloud">
					<X />
				</Button>
			</div>
		</div>
	);
}

/** "12m" while a timed sleep runs, "ch." until the chapter ends, null when off. */
function useSleepLabel({ endsAt, isAtChapterEnd }: SleepTimer): string | null {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (endsAt === null) return;
		setNow(Date.now());
		const tick = setInterval(() => setNow(Date.now()), 15_000);
		return () => clearInterval(tick);
	}, [endsAt]);
	if (isAtChapterEnd) return "ch.";
	if (endsAt === null) return null;
	return `${Math.max(1, Math.ceil((endsAt - now) / 60_000))}m`;
}
