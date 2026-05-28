/**
 * RsvpView: full-screen RSVP word display with focal letter highlighting.
 *
 * Renders one word at a time via the useRsvpEngine hook (tick chain, accel
 * ramp, position save). Tap to play/pause. When paused, shows surrounding
 * words (clickable to scrub), a control bar, and a dictionary-lookup button.
 */

import { calcOrpIndex, type RsvpSettings, type WordIndex } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { useRouter } from "@tanstack/react-router";
import { BookOpen, Loader2, Settings } from "lucide-react";
import React, {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import RsvpSettingsForm from "../settings/rsvp-settings-form";
import RsvpControls from "./rsvp-controls";
import { useRsvpEngine } from "./use-rsvp-engine";
import { useWakeLock } from "./use-wake-lock";

// PX_PER_WORD sets the scroll distance for one word step on touch. Spacer is
// sized so the middle is one viewport away from each edge, giving roughly
// one flick of headroom before re-anchoring.
const PX_PER_WORD = 32;
const SCROLL_END_MS = 150;
// Wheel handled separately from touch: a typical mouse notch is ~100px, so we
// want roughly one word per notch (trackpad sends smaller deltas that accumulate).
const WHEEL_PX_PER_WORD = 50;
const FOCAL_FONT_MULTIPLIER = 2;
const X_OFFSET_CENTER = 50;

const SETTINGS_SNAP_POINTS = [0.3, 0.5, 0.95];

export type RsvpViewHandle = {
	togglePlayPause(): void;
	backWord(): void;
	forwardWord(): void;
	backSentence(): void;
	forwardSentence(): void;
	changeWpm(wpm: number): void;
};

export interface RsvpViewProps {
	content: string;
	initialWord: number;
	settings: RsvpSettings;
	fontSize: number;
	onPositionChange: (word: number) => void;
	onFinished: () => void;
	onWpmChange: (wpm: number) => void;
	onLookup: (word: string, original: string) => void;
	/** Cached WordIndex. When present, the engine skips rebuild. */
	bookWordIndex?: WordIndex | null;
}

const RsvpView = forwardRef<RsvpViewHandle, RsvpViewProps>(function RsvpView(
	{
		content,
		initialWord,
		settings,
		fontSize,
		onPositionChange,
		onFinished,
		onWpmChange,
		onLookup,
		bookWordIndex,
	},
	ref,
) {
	const {
		words,
		currentWord,
		wordIndex,
		isPlaying,
		effectiveWpm,
		context,
		togglePlayPause,
		pause,
		jumpToWord,
		backWord,
		forwardWord,
		backSentence,
		forwardSentence,
		changeWpm,
		lookupFocalWord,
		handleDisplayPointerDown,
		cancelLongPress,
	} = useRsvpEngine({
		content,
		initialWord,
		settings,
		onPositionChange,
		onFinished,
		onLookup,
		onWpmChange,
		bookWordIndex,
	});

	useImperativeHandle(
		ref,
		() => ({ togglePlayPause, backWord, forwardWord, backSentence, forwardSentence, changeWpm }),
		[togglePlayPause, backWord, forwardWord, backSentence, forwardSentence, changeWpm],
	);

	// Keep the screen awake for the whole RSVP session: playback has no touch
	// input so the display would otherwise time out mid-read.
	useWakeLock(true, "rsvp");

	// Single stable click handler for all context words. Uses data-idx on the
	// target button instead of an inline closure per word.
	const handleContextClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			e.stopPropagation();
			const target = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-idx]");
			if (!target) return;
			const idx = Number.parseInt(target.dataset.idx ?? "", 10);
			if (Number.isFinite(idx)) jumpToWord(idx);
		},
		[jumpToWord],
	);

	const handleDictClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			lookupFocalWord();
		},
		[lookupFocalWord],
	);

	// Scroll-to-scrub (paused only). Container has a tall invisible spacer;
	// scrollTop delta from the anchor is mapped to a word delta. On scroll-end
	// the container re-centers so scrolling can continue indefinitely. During
	// playback overflow is hidden via CSS so none of this runs.
	const containerRef = useRef<HTMLDivElement>(null);
	const anchorIdxRef = useRef(0);
	const anchorScrollTopRef = useRef(0);
	const lastAppliedDeltaRef = useRef(0);
	const suppressScrollRef = useRef(false);
	const scrollEndTimerRef = useRef<number | null>(null);

	const wordIndexRef = useRef(wordIndex);
	wordIndexRef.current = wordIndex;
	const isPlayingRef = useRef(isPlaying);
	isPlayingRef.current = isPlaying;

	// Settings sheet pauses playback directly (bypassing togglePlayPause's
	// 120ms debounce) so the sheet never opens with the tick chain still running.
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [settingsSnap, setSettingsSnap] = useState<number | string | null>(SETTINGS_SNAP_POINTS[0]);
	const handleSettingsClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (isPlayingRef.current) pause();
			setSettingsSnap(SETTINGS_SNAP_POINTS[0]);
			setSettingsOpen(true);
		},
		[pause],
	);
	const history = useRouter().history;
	const navigateAfterDismissRef = useRef<string | null>(null);
	const closeSettings = useCallback(() => setSettingsOpen(false), []);
	const handleSettingsDismiss = useCallback(() => {
		setSettingsOpen(false);
		const pending = navigateAfterDismissRef.current;
		if (pending) {
			navigateAfterDismissRef.current = null;
			history.push(pending);
		}
	}, [history]);
	const openFullSettings = useCallback(() => {
		navigateAfterDismissRef.current = "/tabs/settings/rsvp";
		setSettingsOpen(false);
	}, []);

	const reAnchor = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;
		anchorIdxRef.current = wordIndexRef.current;
		lastAppliedDeltaRef.current = 0;
		const middle = (container.scrollHeight - container.clientHeight) / 2;
		anchorScrollTopRef.current = middle;
		if (Math.abs(container.scrollTop - middle) > 1) {
			suppressScrollRef.current = true;
			container.scrollTop = middle;
			requestAnimationFrame(() => {
				suppressScrollRef.current = false;
			});
		}
	}, []);

	// Re-anchor when wordIndex diverges from what our scroll drove (external
	// jump: context-peek click, progress-bar scrub, play→pause). useLayoutEffect
	// so measurement happens before paint, preventing a scrollTop:0 flash.
	useLayoutEffect(() => {
		if (isPlaying) return;
		if (scrollEndTimerRef.current !== null) return;
		const expectedIdx = anchorIdxRef.current + lastAppliedDeltaRef.current;
		if (wordIndex !== expectedIdx) {
			reAnchor();
		}
	}, [wordIndex, isPlaying, reAnchor]);

	const handleScroll = useCallback(() => {
		if (suppressScrollRef.current) return;
		// Ignore scroll events during paused→playing transition (overflow flips
		// to hidden → browser resets scrollTop → spurious event).
		if (isPlayingRef.current) return;
		const container = containerRef.current;
		if (!container) return;

		const deltaPx = container.scrollTop - anchorScrollTopRef.current;
		const deltaWords = Math.round(deltaPx / PX_PER_WORD);
		if (deltaWords !== lastAppliedDeltaRef.current) {
			lastAppliedDeltaRef.current = deltaWords;
			jumpToWord(anchorIdxRef.current + deltaWords);
		}

		if (scrollEndTimerRef.current !== null) clearTimeout(scrollEndTimerRef.current);
		scrollEndTimerRef.current = window.setTimeout(() => {
			scrollEndTimerRef.current = null;
			reAnchor();
		}, SCROLL_END_MS);
	}, [jumpToWord, reAnchor]);

	useEffect(() => {
		return () => {
			if (scrollEndTimerRef.current !== null) clearTimeout(scrollEndTimerRef.current);
		};
	}, []);

	// Wheel: intercept so one notch ≈ one word, independent of native scroll's
	// px-per-notch. Touch still uses native overflow scroll, tuned for drag
	// distance via PX_PER_WORD.
	const wheelAccumRef = useRef(0);
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const onWheel = (e: WheelEvent) => {
			if (isPlayingRef.current) return;
			e.preventDefault();
			wheelAccumRef.current += e.deltaY;
			const words = Math.trunc(wheelAccumRef.current / WHEEL_PX_PER_WORD);
			if (words !== 0) {
				wheelAccumRef.current -= words * WHEEL_PX_PER_WORD;
				jumpToWord(wordIndexRef.current + words);
			}
		};
		container.addEventListener("wheel", onWheel, { passive: false });
		return () => container.removeEventListener("wheel", onWheel);
	}, [jumpToWord]);

	if (words.length === 0) {
		return (
			<div className="rsvp-display">
				<Loader2 className="absolute top-1/2 left-1/2 size-8 -translate-x-1/2 -translate-y-1/2 animate-spin text-[var(--reader-text,currentColor)]" />
			</div>
		);
	}

	const word = currentWord?.word ?? "";
	const orpIndex = calcOrpIndex(word.length);
	const before = word.slice(0, orpIndex);
	const focal = word[orpIndex] ?? "";
	const after = word.slice(orpIndex + 1);

	// Anchor container center at xOffset%. The word-line inside is then shifted
	// so its focal letter coincides with the container center, so context
	// (centered on container) and focal letter share an axis.
	const shiftCh = orpIndex + 0.5;
	const wordShiftCh = word.length / 2 - shiftCh;

	return (
		<>
			<div
				ref={containerRef}
				className={isPlaying ? "rsvp-display" : "rsvp-display rsvp-display--paused"}
				style={{ "--rsvp-focal-color": settings.focalLetterColor } as React.CSSProperties}
				onClick={togglePlayPause}
				onScroll={handleScroll}
				onPointerDown={handleDisplayPointerDown}
				onPointerUp={cancelLongPress}
				onPointerLeave={cancelLongPress}
				onPointerCancel={cancelLongPress}
			>
				{/* Sticky overlay root stays pinned to viewport while container scrolls.
				    All visual + interactive elements live here; spacer below provides
				    the scroll distance. */}
				<div className="rsvp-overlay-root">
					<div className="rsvp-display-inner">
						<div className="rsvp-focal-line" style={{ left: `${settings.xOffset}%` }} />

						{isPlaying && effectiveWpm > 0 && (
							<div
								className={
									effectiveWpm < settings.wpm
										? "rsvp-speed-chip rsvp-speed-chip--ramping"
										: "rsvp-speed-chip"
								}
							>
								{effectiveWpm} wpm
							</div>
						)}

						{word && (
							<div
								className="rsvp-word-container"
								style={{
									// Paused: container centered so context peek sits on horizontal
									// center-line. Playing: whole word stack moves to xOffset%.
									left: isPlaying ? `${settings.xOffset}%` : `${X_OFFSET_CENTER}%`,
									transform: "translate(-50%, -50%)",
									fontSize: `${fontSize * FOCAL_FONT_MULTIPLIER}px`,
								}}
							>
								{context && context.prev.length > 0 && (
									<div
										className="rsvp-context-inline rsvp-context-prev"
										onClick={handleContextClick}
									>
										...
										{context.prev.map(({ word: cw, idx: ci, breakBefore }, i) => (
											<React.Fragment key={ci}>
												{breakBefore && i > 0 && (
													<span className="rsvp-context-break" aria-hidden />
												)}
												<button type="button" data-idx={ci} className="rsvp-context-word">
													{cw}
												</button>
											</React.Fragment>
										))}
									</div>
								)}
								<span
									className="rsvp-word-line"
									style={{
										// Paused: shift word-line to xOffset% of display (container
										// stays centered). Playing: focal-shift only. `cqw` is
										// container-query width relative to `.rsvp-display-inner`
										// (which sets `container-type: inline-size` and caps at 700px).
										transform: isPlaying
											? `translateX(${wordShiftCh}ch)`
											: `translateX(calc(${settings.xOffset - X_OFFSET_CENTER}cqw + ${wordShiftCh}ch))`,
									}}
								>
									<span className="rsvp-before">{before}</span>
									<span className="rsvp-focal">{focal}</span>
									<span className="rsvp-after">{after}</span>
								</span>
								{context && context.next.length > 0 && (
									<div
										className="rsvp-context-inline rsvp-context-next"
										onClick={handleContextClick}
									>
										{context.next.map(({ word: cw, idx: ci, breakBefore }, i) => (
											<React.Fragment key={ci}>
												{breakBefore && i > 0 && (
													<span className="rsvp-context-break" aria-hidden />
												)}
												<button type="button" data-idx={ci} className="rsvp-context-word">
													{cw}
												</button>
											</React.Fragment>
										))}
										...
									</div>
								)}
							</div>
						)}

						{!isPlaying && !currentWord && (
							<div className="rsvp-paused-indicator">Tap to start</div>
						)}

						{!isPlaying && (
							<>
								<RsvpControls
									wpm={settings.wpm}
									onBackSentence={backSentence}
									onBackWord={backWord}
									onPlayPause={togglePlayPause}
									onForwardWord={forwardWord}
									onForwardSentence={forwardSentence}
									onWpmChange={changeWpm}
								/>
								<button
									type="button"
									className="rsvp-dict-button"
									onClick={handleDictClick}
									aria-label="Dictionary lookup"
								>
									<BookOpen className="size-5" />
								</button>
								<button
									type="button"
									className="rsvp-settings-button"
									onClick={handleSettingsClick}
									aria-label="RSVP settings"
								>
									<Settings className="size-5" />
								</button>
							</>
						)}
					</div>
				</div>

				{/* Spacer provides scroll distance while paused. Rendered after
				    the sticky overlay so the overlay's natural position is at
				    top:0 (sticky then pins it across the full scroll). */}
				{!isPlaying && <div className="rsvp-scroll-spacer" aria-hidden />}
			</div>

			{/* Drawer is a sibling of the display (not a child) so clicks inside
			    don't bubble to the display's onClick={togglePlayPause}. */}
			<Drawer
				open={settingsOpen}
				onOpenChange={(open) => {
					if (!open) handleSettingsDismiss();
				}}
				snapPoints={SETTINGS_SNAP_POINTS}
				activeSnapPoint={settingsSnap}
				setActiveSnapPoint={setSettingsSnap}
			>
				<DrawerContent className="h-full">
					<DrawerHeader className="flex flex-row items-center justify-between gap-2">
						<DrawerTitle className="flex-1">RSVP settings</DrawerTitle>
						<Button variant="ghost" size="sm" onClick={closeSettings}>
							Close
						</Button>
					</DrawerHeader>
					<div className="flex-1 overflow-y-auto px-1 pb-6">
						<RsvpSettingsForm minimal onOpenFullSettings={openFullSettings} />
					</div>
				</DrawerContent>
			</Drawer>
		</>
	);
});

export default React.memo(RsvpView);
