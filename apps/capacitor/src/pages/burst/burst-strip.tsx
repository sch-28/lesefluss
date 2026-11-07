import { calcOrpIndex, DEFAULT_SETTINGS, type RsvpSettings, type WordIndex } from "@lesefluss/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, X } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { GoalRing } from "../../components/goal-ring";
import { focalLetterColorFor, useTheme } from "../../contexts/theme-context";
import { useAutoSaveSettings } from "../../hooks/use-auto-save-settings";
import { usePersistentString } from "../../hooks/use-persistent-string";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import type { Book } from "../../services/db/schema";
import { fullSync } from "../../services/sync";
import { canHaveGoal, liveToday } from "../library/reading-goal/goal-model";
import { readPendingPosition, recoverPendingWord } from "../reader/pending-position";
import { useRsvpEngine } from "../reader/use-rsvp-engine";
import { RSVP_WPM_RANGE, steppedWpm } from "../reader/wpm";
import { type BurstPosition, createBurstPosition } from "./burst-position";
import { closeBurst } from "./open-burst";
import { TextLines, type TextLinesHandle } from "./text-lines";
import { useBurstFocus } from "./use-burst-focus";

type BurstMode = "rsvp" | "text";
const isBurstMode = (value: string): value is BurstMode => value === "rsvp" || value === "text";

/** Words played since the strip showed, below which a late sync may still move it. */
const LATE_SYNC_WORDS = 5;
const SUMMARY_MS = 1000;

type Host = { host: "pip" | "tab"; win: Window };

function percentOf(word: number, total: number): number {
	return total > 0 ? Math.min(100, Math.floor((word / total) * 100)) : 0;
}

function StripFrame({ children, host }: { children: React.ReactNode; host: Host["host"] }) {
	return (
		<div
			className={
				host === "pip"
					? "flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground"
					: "flex h-[120px] w-[600px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-2xl"
			}
		>
			{children}
		</div>
	);
}

function EmptyStrip({ host }: { host: Host["host"] }) {
	return (
		<StripFrame host={host}>
			<div className="flex flex-1 flex-col justify-center gap-1 px-4" data-testid="burst-empty">
				<span className="font-semibold text-muted-foreground text-xs">Lesefluss burst read</span>
				<span className="font-serif text-lg">Open a book in Lesefluss first</span>
				<span className="text-muted-foreground text-xs">
					The strip continues the book you read last.
				</span>
			</div>
		</StripFrame>
	);
}

/** The burst strip: the given book, or the one read last. */
export function BurstStrip({ bookId, host, win }: Host & { bookId: string | null }) {
	const lastRead = useQuery({
		queryKey: ["burst", "last-read-book"],
		queryFn: () => queries.getLastReadBookId(),
		enabled: bookId === null,
		gcTime: 0,
	});
	const id = bookId ?? lastRead.data ?? null;
	if (bookId === null && lastRead.isPending) return <StripFrame host={host}>{null}</StripFrame>;
	if (!id) return <EmptyStrip host={host} />;
	return <BurstBook bookId={id} host={host} win={win} />;
}

function BurstBook({ bookId, host, win }: Host & { bookId: string }) {
	const qc = useQueryClient();
	// The cached row lags an open reader's own saves; seeding from it would start
	// the strip, and stamp its writes, behind the word the reader already saved.
	const [isFresh, setFresh] = useState(false);
	useEffect(() => {
		let live = true;
		void qc
			.fetchQuery({
				queryKey: bookKeys.detail(bookId),
				queryFn: () => queries.getBook(bookId),
				staleTime: 0,
			})
			.catch(() => {})
			.finally(() => {
				if (live) setFresh(true);
			});
		return () => {
			live = false;
		};
	}, [qc, bookId]);
	const { data: book, isPending: isBookPending } = queryHooks.useBook(bookId);
	const { data: contentRow, isPending: isContentPending } = queryHooks.useBookContent(bookId);
	const { data: wordIndex, isPending: isIndexPending } = queryHooks.useBookWordIndex(bookId);
	const { data: dbSettings } = queryHooks.useSettings();
	if (!isFresh || isBookPending || isContentPending || isIndexPending || !dbSettings) {
		return <StripFrame host={host}>{null}</StripFrame>;
	}
	const content = contentRow?.content;
	if (!book || !content) return <EmptyStrip host={host} />;
	return (
		<BurstReading
			book={book}
			content={content}
			wordIndex={wordIndex ?? null}
			host={host}
			win={win}
		/>
	);
}

type Phase = "reading" | "summary" | "hidden";
type Summary = { words: number; status: "saving" | "saved" | "failed" };

function BurstReading({
	book,
	content,
	wordIndex,
	host,
	win,
}: Host & { book: Book; content: string; wordIndex: WordIndex | null }) {
	const qc = useQueryClient();
	const { theme } = useTheme();
	const { data: dbSettings } = queryHooks.useSettings();
	const { updateSetting } = useAutoSaveSettings();
	const [mode, setMode] = usePersistentString<BurstMode>("burst-mode", isBurstMode, "rsvp");
	const [phase, setPhase] = useState<Phase>("reading");
	const [summary, setSummary] = useState<Summary | null>(null);
	const [startWord] = useState(
		() =>
			recoverPendingWord(book.wordPosition, book.lastRead ?? 0, readPendingPosition(book.id)) ??
			book.wordPosition,
	);

	const rootRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<TextLinesHandle>(null);
	const phaseRef = useRef(phase);
	phaseRef.current = phase;
	const modeRef = useRef(mode);
	modeRef.current = mode;
	const shownRef = useRef(startWord);
	const wakeWordRef = useRef(startWord);
	const hasKeyPressRef = useRef(false);
	const awaitsFocusRef = useRef(false);
	const summaryTimerRef = useRef<number | null>(null);

	const settings = useMemo<RsvpSettings>(
		() => ({
			wpm: dbSettings?.wpm ?? DEFAULT_SETTINGS.WPM,
			delayComma: dbSettings?.delayComma ?? DEFAULT_SETTINGS.DELAY_COMMA,
			delayPeriod: dbSettings?.delayPeriod ?? DEFAULT_SETTINGS.DELAY_PERIOD,
			accelStart: dbSettings?.accelStart ?? DEFAULT_SETTINGS.ACCEL_START,
			accelRate: dbSettings?.accelRate ?? DEFAULT_SETTINGS.ACCEL_RATE,
			xOffset: dbSettings?.xOffset ?? DEFAULT_SETTINGS.X_OFFSET,
			focalLetterColor: dbSettings?.focalLetterColor ?? DEFAULT_SETTINGS.FOCAL_LETTER_COLOR,
		}),
		[dbSettings],
	);

	const canAdoptRemote = () =>
		!hasKeyPressRef.current && Math.abs(shownRef.current - wakeWordRef.current) < LATE_SYNC_WORDS;
	const adoptRef = useRef<(word: number) => void>(() => {});
	const [position] = useState<BurstPosition>(() => {
		const created = createBurstPosition({
			qc,
			bookId: book.id,
			seriesId: book.seriesId ?? null,
			canAdoptRemote,
			onAdopt: (row) => adoptRef.current(row.wordPosition),
		});
		created.seed({ wordPosition: book.wordPosition, updatedAt: book.updatedAt });
		return created;
	});

	const engine = useRsvpEngine({
		content,
		initialWord: startWord,
		settings,
		onPositionChange: (word) => {
			shownRef.current = word;
			void position.save(word);
		},
		onFinished: () => {},
		onLookup: () => {},
		onWpmChange: (wpm) => updateSetting("wpm", wpm),
		bookWordIndex: wordIndex,
		visibilityDocument: host === "pip" ? win.document : undefined,
	});
	const engineRef = useRef(engine);
	engineRef.current = engine;
	if (engine.currentWord) shownRef.current = engine.wordIndex;

	adoptRef.current = (word) => {
		const e = engineRef.current;
		const wasPlaying = e.isPlaying;
		e.showWord(word);
		shownRef.current = word;
		wakeWordRef.current = word;
		if (wasPlaying) e.play();
	};

	// A newer position written while the strip was away (the reader, a sync) is
	// what the next burst shows; while reading, only inside the late-sync window.
	const { data: liveBook } = queryHooks.useBook(book.id);
	useEffect(() => {
		if (!liveBook || liveBook.updatedAt <= position.baseRev()) return;
		if (phaseRef.current === "reading" && !canAdoptRemote()) return;
		position.seed({ wordPosition: liveBook.wordPosition, updatedAt: liveBook.updatedAt });
		adoptRef.current(liveBook.wordPosition);
	});

	const lateSync = () => {
		// Never waited on: the strip shows the local word at once.
		void fullSync({ reportNotBackedUp: false })
			.then(() => qc.invalidateQueries({ queryKey: bookKeys.detail(book.id) }))
			.catch(() => {});
	};

	const startBurst = () => {
		awaitsFocusRef.current = false;
		hasKeyPressRef.current = false;
		wakeWordRef.current = shownRef.current;
		if (modeRef.current === "rsvp") engineRef.current.play();
		lateSync();
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: plays once, on open
	useEffect(() => {
		if (host === "pip") win.focus();
		// Opened unseen (a silent special workspace): the first focus starts it.
		if (host === "pip" && !win.document.hasFocus()) awaitsFocusRef.current = true;
		else startBurst();
		return () => {
			if (summaryTimerRef.current !== null) clearTimeout(summaryTimerRef.current);
		};
	}, []);

	const wake = () => {
		if (phaseRef.current === "reading") {
			if (awaitsFocusRef.current) startBurst();
			return;
		}
		if (summaryTimerRef.current !== null) clearTimeout(summaryTimerRef.current);
		setPhase("reading");
		setSummary(null);
		void qc.invalidateQueries({ queryKey: bookKeys.detail(book.id) });
		startBurst();
	};

	const hide = () => {
		if (phaseRef.current !== "reading") return;
		phaseRef.current = "summary";
		// Reports the shown word, which queues its save.
		engineRef.current.pause();
		const words = Math.max(0, shownRef.current - wakeWordRef.current);
		setPhase("summary");
		setSummary({ words, status: "saving" });
		void position.save(shownRef.current, { pushNow: true }).then((result) => {
			const status = result === "failed" || result === "stale" ? "failed" : "saved";
			setSummary((prev) => (prev ? { ...prev, status } : prev));
		});
		summaryTimerRef.current = window.setTimeout(() => setPhase("hidden"), SUMMARY_MS);
	};

	useBurstFocus({ host, win, rootRef, onWake: wake, onHide: hide });

	// After the commit: the pill a wake leaves takes no focus.
	useEffect(() => {
		if (host === "tab" && phase === "reading") rootRef.current?.focus();
	}, [host, phase]);

	const switchMode = (next: BurstMode) => {
		hasKeyPressRef.current = true;
		if (next === mode) return;
		// Text never plays: the word playing now is where it opens.
		if (next === "text") engine.pause();
		setMode(next);
	};

	useEffect(() => {
		const target: Document | HTMLElement | null = host === "pip" ? win.document : rootRef.current;
		if (!target) return;
		const onKey = (event: Event) => {
			const e = event as KeyboardEvent;
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			const ev = engineRef.current;
			if (phaseRef.current !== "reading") {
				if (e.key === " ") {
					e.preventDefault();
					wakeRef.current();
				}
				return;
			}
			const isText = modeRef.current === "text";
			switch (e.key) {
				case " ":
					if (!isText) ev.togglePlayPause();
					break;
				case "ArrowLeft":
					ev.backWord();
					break;
				case "ArrowRight":
					ev.forwardWord();
					break;
				case "ArrowUp":
				case "ArrowDown": {
					const up = e.key === "ArrowUp";
					if (isText) {
						const word = textRef.current?.wordOnLine(up ? -1 : 1);
						if (word != null) ev.jumpToWord(word);
					} else {
						ev.changeWpm(steppedWpm(settingsRef.current.wpm, RSVP_WPM_RANGE, up ? 1 : -1));
					}
					break;
				}
				case "Escape":
					if (host === "pip") closeBurst();
					else hideRef.current();
					break;
				default:
					return;
			}
			e.preventDefault();
			e.stopPropagation();
			hasKeyPressRef.current = true;
		};
		target.addEventListener("keydown", onKey);
		return () => target.removeEventListener("keydown", onKey);
	}, [host, win]);
	const wakeRef = useRef(wake);
	wakeRef.current = wake;
	const hideRef = useRef(hide);
	hideRef.current = hide;
	const settingsRef = useRef(settings);
	settingsRef.current = settings;

	const goal = queryHooks.useReadingGoalPlan(canHaveGoal(book) ? book.id : null, { live: true });
	const goalPlan =
		goal.data?.goal.status === "active" && goal.data.plan.kind === "plan" ? goal.data.plan : null;
	const goalToday = goalPlan ? liveToday(goalPlan, shownRef.current, book.wordCount) : null;

	const total = engine.words.length;
	const percent = percentOf(engine.wordIndex, total);
	const progress = total > 1 ? engine.wordIndex / (total - 1) : 0;

	if (phase === "hidden") {
		if (host === "pip") return <div ref={rootRef} className="h-screen w-screen bg-background" />;
		return (
			<div ref={rootRef} className="flex items-center gap-1" data-testid="burst-pill">
				<button
					type="button"
					onClick={wake}
					className="rounded-full border border-border bg-background px-3 py-1.5 text-foreground text-sm shadow-lg"
				>
					Burst · <span className="max-w-48 truncate">{book.title}</span> {percent}%
				</button>
				<button
					type="button"
					aria-label="Close burst read"
					onClick={closeBurst}
					className="rounded-full border border-border bg-background p-1.5 text-muted-foreground shadow-lg"
				>
					<X className="size-3.5" />
				</button>
			</div>
		);
	}

	const word = engine.currentWord?.word ?? "";
	const orp = calcOrpIndex(word.length);

	return (
		<div
			ref={rootRef}
			tabIndex={-1}
			className="outline-none"
			data-testid="burst-strip"
			data-phase={phase}
			data-word={engine.wordIndex}
			data-playing={engine.isPlaying}
			data-mode={mode}
		>
			<StripFrame host={host}>
				<div className="flex items-center gap-2 px-3 pt-2 text-xs">
					{host === "tab" && (
						<GripVertical
							className="size-3.5 shrink-0 cursor-grab text-muted-foreground"
							data-burst-grip=""
						/>
					)}
					<span className="min-w-0 flex-1 truncate">
						<span className="font-semibold">{book.title}</span>
						<span className="text-muted-foreground"> · {percent}%</span>
					</span>
					<span className="flex shrink-0 items-center gap-1.5 text-muted-foreground tabular-nums">
						{engine.isPlaying ? (
							<>
								<span className="size-1.5 rounded-full bg-[var(--goal-met)]" />
								{engine.effectiveWpm || settings.wpm} wpm
							</>
						) : (
							<>
								<span className="size-1.5 bg-muted-foreground" />
								Paused · Space
							</>
						)}
					</span>
					<fieldset
						className="flex shrink-0 rounded-md border border-border p-0.5"
						aria-label="Reading mode"
					>
						{(["rsvp", "text"] as const).map((m) => (
							<button
								key={m}
								type="button"
								aria-pressed={mode === m}
								onClick={() => switchMode(m)}
								className={`rounded px-1.5 py-0.5 ${mode === m ? "bg-muted text-foreground" : "text-muted-foreground"}`}
							>
								{m === "rsvp" ? "RSVP" : "Text"}
							</button>
						))}
					</fieldset>
					{host === "tab" && (
						<button
							type="button"
							aria-label="Close burst read"
							onClick={closeBurst}
							className="shrink-0 text-muted-foreground"
						>
							<X className="size-3.5" />
						</button>
					)}
				</div>

				<div className="relative flex min-h-0 flex-1 items-center px-4">
					{mode === "rsvp" ? (
						<button
							type="button"
							onClick={() => {
								hasKeyPressRef.current = true;
								engine.togglePlayPause();
							}}
							aria-label={engine.isPlaying ? "Pause" : "Play"}
							className="relative grid w-full grid-cols-[1fr_auto_1fr] items-baseline font-serif text-[30px] leading-none"
							style={
								{
									"--burst-focal": focalLetterColorFor(settings.focalLetterColor, theme),
								} as CSSProperties
							}
						>
							<span className="pointer-events-none absolute -top-2 left-1/2 h-1.5 w-px bg-muted-foreground/60" />
							<span className="pointer-events-none absolute -bottom-2 left-1/2 h-1.5 w-px bg-muted-foreground/60" />
							<span className="whitespace-pre text-right">{word.slice(0, orp)}</span>
							<span className="text-[var(--burst-focal)]">{word[orp] ?? ""}</span>
							<span className="whitespace-pre text-left">{word.slice(orp + 1)}</span>
						</button>
					) : (
						<div className="w-full">
							<TextLines ref={textRef} words={engine.words} index={engine.wordIndex} />
						</div>
					)}

					{phase === "summary" && summary && (
						<div
							className="absolute inset-0 flex items-center justify-center gap-4 bg-background/95"
							data-testid="burst-summary"
						>
							<span className="font-semibold text-xl tabular-nums">+{summary.words} words</span>
							<span className="flex items-center gap-2 text-muted-foreground text-sm">
								{goalToday && (
									<>
										<GoalRing size={18} fraction={goalToday.fraction} isMet={goalToday.isMet} />
										Goal {Math.round(goalToday.fraction * 100)}% ·
									</>
								)}
								{summary.status === "saving"
									? "saving…"
									: summary.status === "saved"
										? "saved"
										: "not saved"}
							</span>
						</div>
					)}
				</div>

				<div className="h-[3px] w-full bg-muted">
					<div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
				</div>
			</StripFrame>
		</div>
	);
}
