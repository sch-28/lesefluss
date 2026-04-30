/**
 * RsvpView - full-screen RSVP word display with focal letter highlighting.
 *
 * Renders one word at a time via the useRsvpEngine hook (tick chain,
 * acceleration ramp, position save). Tap to play/pause. When paused,
 * shows surrounding words (clickable to scrub), a control bar, and a
 * dictionary-lookup button.
 */

import {
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonIcon,
	IonModal,
	IonSpinner,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import { calcOrpIndex, type RsvpSettings } from "@lesefluss/rsvp-core";
import { bookOutline, settingsOutline } from "ionicons/icons";
import React, {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useHistory } from "react-router-dom";
import RsvpSettingsForm from "../settings/rsvp-settings-form";
import RsvpControls from "./rsvp-controls";
import { useRsvpEngine } from "./use-rsvp-engine";

// Scroll-scrub tunables. `PX_PER_WORD` sets the scroll distance for one
// word step on touch; the spacer is sized so the middle is 1 viewport away
// from each edge, giving ~one-flick headroom before re-anchoring.
const PX_PER_WORD = 32;
const SCROLL_END_MS = 150;
// Wheel is handled separately from touch: a typical mouse notch is ~100px,
// so we want roughly one word per notch (trackpad sends smaller deltas that
// accumulate).
const WHEEL_PX_PER_WORD = 50;
// Visual constants.
const FOCAL_FONT_MULTIPLIER = 2; // focal word is this many × the reader font size
const X_OFFSET_CENTER = 50; // xOffset value that corresponds to horizontal center

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
	initialByteOffset: number;
	settings: RsvpSettings;
	fontSize: number;
	onPositionChange: (byteOffset: number) => void;
	onFinished: () => void;
	onWpmChange: (wpm: number) => void;
	onLookup: (word: string, original: string) => void;
}

const spinnerStyle: React.CSSProperties = {
	color: "var(--reader-text, currentColor)",
	width: "32px",
	height: "32px",
	position: "absolute",
	top: "50%",
	left: "50%",
	transform: "translate(-50%, -50%)",
};

const RsvpView = forwardRef<RsvpViewHandle, RsvpViewProps>(function RsvpView(
	{
		content,
		initialByteOffset,
		settings,
		fontSize,
		onPositionChange,
		onFinished,
		onWpmChange,
		onLookup,
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
		initialByteOffset,
		settings,
		onPositionChange,
		onFinished,
		onLookup,
		onWpmChange,
	});

	useImperativeHandle(
		ref,
		() => ({ togglePlayPause, backWord, forwardWord, backSentence, forwardSentence, changeWpm }),
		[togglePlayPause, backWord, forwardWord, backSentence, forwardSentence, changeWpm],
	);

	// Single stable click handler for all context words - uses data-idx
	// on the target button instead of an inline closure per word.
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

	// ─── Scroll-to-scrub (paused only) ────────────────────────────────────
	// Container has a tall invisible spacer; scrollTop delta from the anchor
	// is mapped to a word delta. On scroll-end the container re-centers so
	// scrolling can continue indefinitely. During playback overflow is
	// hidden via CSS so none of this runs.
	const containerRef = useRef<HTMLDivElement>(null);
	const anchorIdxRef = useRef(0);
	const anchorScrollTopRef = useRef(0);
	const lastAppliedDeltaRef = useRef(0);
	const suppressScrollRef = useRef(false);
	const scrollEndTimerRef = useRef<number | null>(null);

	// Mirror wordIndex and isPlaying into refs so the wheel handler and
	// setTimeout-scheduled callbacks always read fresh values.
	const wordIndexRef = useRef(wordIndex);
	wordIndexRef.current = wordIndex;
	const isPlayingRef = useRef(isPlaying);
	isPlayingRef.current = isPlaying;

	// Settings modal - pauses playback directly (bypassing togglePlayPause's
	// 120 ms debounce) so the modal never opens with the tick chain still
	// running behind it.
	const [settingsOpen, setSettingsOpen] = useState(false);
	const handleSettingsClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (isPlayingRef.current) pause();
			setSettingsOpen(true);
		},
		[pause],
	);
	const history = useHistory();
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
			// Clear suppress on the next frame - the scroll event fires async
			requestAnimationFrame(() => {
				suppressScrollRef.current = false;
			});
		}
	}, []);

	// Re-anchor whenever wordIndex diverges from what our scroll drove -
	// i.e. an external jump (context-peek click, progress-bar scrub, play→pause).
	// useLayoutEffect so measurement happens before the browser paints,
	// preventing a flash at scrollTop:0 on first mount.
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
		// Ignore scroll events emitted during the paused→playing transition
		// (overflow flips to hidden → browser resets scrollTop → spurious event).
		if (isPlayingRef.current) return;
		const container = containerRef.current;
		if (!container) return;

		const deltaPx = container.scrollTop - anchorScrollTopRef.current;
		const deltaWords = Math.round(deltaPx / PX_PER_WORD);
		if (deltaWords !== lastAppliedDeltaRef.current) {
			lastAppliedDeltaRef.current = deltaWords;
			jumpToWord(anchorIdxRef.current + deltaWords);
		}

		// Debounced re-anchor after scroll momentum settles
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

	// ── Wheel: intercept so one notch ≈ one word, independent of native
	// scroll's px-per-notch. Touch still uses native overflow scroll, which
	// is tuned for drag distance via PX_PER_WORD.
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
				<IonSpinner style={spinnerStyle} />
			</div>
		);
	}

	const word = currentWord?.word ?? "";
	const orpIndex = calcOrpIndex(word.length);
	const before = word.slice(0, orpIndex);
	const focal = word[orpIndex] ?? "";
	const after = word.slice(orpIndex + 1);

	// Anchor the container center at xOffset%. The word-line inside is then
	// shifted so its focal letter coincides with the container center - that
	// way context (centered on container) and focal letter share an axis.
	const shiftCh = orpIndex + 0.5;
	const wordShiftCh = word.length / 2 - shiftCh;

	return (
		<>
			<div
				ref={containerRef}
				className={isPlaying ? "rsvp-display" : "rsvp-display rsvp-display--paused"}
				onClick={togglePlayPause}
				onScroll={handleScroll}
				onPointerDown={handleDisplayPointerDown}
				onPointerUp={cancelLongPress}
				onPointerLeave={cancelLongPress}
				onPointerCancel={cancelLongPress}
			>
				{/* Sticky overlay root - stays pinned to the viewport while the
			    container scrolls. All visual elements + interactive controls
			    live here; the spacer below provides the scroll distance. */}
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
									// While paused the container is centered so the context peek
									// sits on the horizontal center-line of the display; while
									// playing the whole word stack moves to xOffset%.
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
										// When paused, shift the word-line out to xOffset% of the display
										// (container stays centered). When playing, only the focal-shift.
										// `cqw` = container-query width, relative to `.rsvp-display-inner`
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
									<IonIcon icon={bookOutline} />
								</button>
								<button
									type="button"
									className="rsvp-settings-button"
									onClick={handleSettingsClick}
									aria-label="RSVP settings"
								>
									<IonIcon icon={settingsOutline} />
								</button>
							</>
						)}
					</div>
				</div>

				{/* Spacer provides scroll distance while paused. Rendered after
			    the sticky overlay so the overlay's natural position is at
			    top:0 (sticky then pins it there across the full scroll). */}
				{!isPlaying && <div className="rsvp-scroll-spacer" aria-hidden />}
			</div>

			{/* Modal is a sibling of the display (not a child) so clicks inside
		    don't bubble through React's virtual DOM to the display's
		    onClick={togglePlayPause}. */}
			<IonModal
				isOpen={settingsOpen}
				onDidDismiss={handleSettingsDismiss}
				className="rsvp-settings-modal"
				breakpoints={[0, 0.3, 0.5, 0.95]}
				initialBreakpoint={0.3}
				expandToScroll={false}
			>
				<IonHeader class="ion-no-border">
					<IonToolbar>
						<IonTitle>RSVP settings</IonTitle>
						<IonButtons slot="end">
							<IonButton onClick={closeSettings}>Close</IonButton>
						</IonButtons>
					</IonToolbar>
				</IonHeader>
				<IonContent className="ion-padding">
					<RsvpSettingsForm minimal onOpenFullSettings={openFullSettings} />
				</IonContent>
			</IonModal>
		</>
	);
});

export default React.memo(RsvpView);
