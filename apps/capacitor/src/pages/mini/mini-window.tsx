import { calcOrpIndex, type RsvpSettings } from "@lesefluss/core";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { RsvpSpeedControl } from "../../components/rsvp-speed-control";
import { writePendingPosition } from "../reader/pending-position";
import { useRsvpEngine } from "../reader/use-rsvp-engine";
import { RSVP_WPM_RANGE, steppedWpm } from "../reader/wpm";
import { type Client, createClient, type MiniPort, type MiniStart } from "./mini-bridge";

type Props = {
	port: MiniPort;
	win: Window;
	host: "pip" | "popup";
};

const controlClass = "grid size-8 place-items-center rounded-md hover:bg-muted";

function percentOf(word: number, total: number): number {
	return total > 0 ? Math.min(100, Math.floor((word / total) * 100)) : 0;
}

function Frame({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
			{children}
		</div>
	);
}

/** The Quick RSVP window, in a Picture-in-Picture window or a popup. It never saves: it reports. */
export function MiniWindow({ port, win, host }: Props) {
	const [start, setStart] = useState<MiniStart | null>(null);
	const [isMainGone, setMainGone] = useState(false);
	const startRef = useRef<{ onPosition(word: number): void; onStop(word: number | null): void }>({
		onPosition: () => {},
		onStop: () => setMainGone(true),
	});
	const [settingsUpdate, setSettingsUpdate] = useState<{
		settings: RsvpSettings;
		focalColor: string;
	} | null>(null);
	const [client, setClient] = useState<Client | null>(null);

	useEffect(() => {
		const created = createClient(
			port,
			{
				onStart: setStart,
				onPosition: (word) => startRef.current.onPosition(word),
				onSettings: (settings, focalColor) => setSettingsUpdate({ settings, focalColor }),
				onStop: (word) => startRef.current.onStop(word),
			},
			{ watchdog: host === "popup" },
		);
		setClient(created);
		const onPageHide = () => created.closed();
		win.addEventListener("pagehide", onPageHide);
		return () => {
			win.removeEventListener("pagehide", onPageHide);
			created.dispose();
		};
	}, [port, win, host]);

	useEffect(() => {
		if (host !== "popup" || !start?.appearance) return;
		const { htmlClass, htmlStyle, bodyClass } = start.appearance;
		win.document.documentElement.className = htmlClass;
		win.document.documentElement.setAttribute("style", htmlStyle);
		win.document.body.className = bodyClass;
		win.document.title = `Quick RSVP · ${start.title}`;
	}, [host, start, win]);

	if (!start || !client) {
		return (
			<Frame>
				<div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
					{isMainGone ? "The book was closed in the main tab." : "Opening…"}
				</div>
			</Frame>
		);
	}
	return (
		<MiniReading
			start={start}
			client={client}
			win={win}
			host={host}
			handlersRef={startRef}
			settingsUpdate={settingsUpdate}
		/>
	);
}

type Status = "playing" | "paused" | "taken-over";

function MiniReading({
	start,
	client,
	win,
	host,
	handlersRef,
	settingsUpdate,
}: {
	start: MiniStart;
	client: Client;
	win: Window;
	host: "pip" | "popup";
	handlersRef: React.RefObject<{
		onPosition(word: number): void;
		onStop(word: number | null): void;
	}>;
	settingsUpdate: { settings: RsvpSettings; focalColor: string } | null;
}) {
	const settings = settingsUpdate?.settings ?? start.settings;
	const focalColor = settingsUpdate?.focalColor ?? start.focalColor;
	const [status, setStatus] = useState<Status>("paused");
	const [stoppedAt, setStoppedAt] = useState<number | null>(null);
	const isStoppedRef = useRef(false);

	const engine = useRsvpEngine({
		content: start.content,
		initialWord: start.startWord,
		settings,
		onPositionChange: (word) => {
			if (!isStoppedRef.current) client.save(word, engineRef.current.isPlaying);
		},
		onFinished: () => {},
		onLookup: () => {},
		onWpmChange: (wpm) => client.wpm(wpm),
		bookWordIndex: start.wordIndex,
		visibilityDocument: host === "pip" ? win.document : undefined,
		timerWindow: host === "pip" ? win : undefined,
	});
	const engineRef = useRef(engine);
	engineRef.current = engine;

	useEffect(() => {
		if (engine.currentWord && !isStoppedRef.current) client.shown(engine.wordIndex);
	}, [engine.wordIndex, engine.currentWord, client]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reports the playing state's changes only
	useEffect(() => {
		if (!isStoppedRef.current) client.playing(engine.isPlaying, engineRef.current.wordIndex);
		setStatus((s) => (engine.isPlaying ? "playing" : s === "taken-over" ? s : "paused"));
	}, [engine.isPlaying]);

	handlersRef.current = {
		onPosition: (word) => {
			const wasPlaying = engineRef.current.isPlaying;
			engineRef.current.showWord(word);
			if (wasPlaying) setStatus("taken-over");
		},
		onStop: (word) => {
			isStoppedRef.current = true;
			const e = engineRef.current;
			const at = word ?? e.wordIndex;
			e.showWord(at);
			// The main tab went silent without saying where it saved: keep the
			// word for its next open, which recovers it like any unsaved move.
			if (word === null) writePendingPosition(start.bookId, at, Date.now());
			setStoppedAt(at);
		},
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: plays once, on open
	useEffect(() => {
		win.focus();
		engine.play();
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey || e.altKey || isStoppedRef.current) return;
			const ev = engineRef.current;
			switch (e.key) {
				case " ":
					ev.togglePlayPause();
					break;
				case "ArrowLeft":
					ev.backWord();
					break;
				case "ArrowRight":
					ev.forwardWord();
					break;
				case "ArrowUp":
				case "ArrowDown":
					ev.changeWpm(
						steppedWpm(settingsRef.current.wpm, RSVP_WPM_RANGE, e.key === "ArrowUp" ? 1 : -1),
					);
					break;
				default:
					return;
			}
			e.preventDefault();
		};
		win.document.addEventListener("keydown", onKey);
		return () => win.document.removeEventListener("keydown", onKey);
	}, [win]);
	const settingsRef = useRef(settings);
	settingsRef.current = settings;

	const total = engine.words.length;
	const percent = percentOf(engine.wordIndex, total);
	const progress = total > 1 ? engine.wordIndex / (total - 1) : 0;
	const word = engine.currentWord?.word ?? "";
	const orp = calcOrpIndex(word.length);
	const stoppedWord = stoppedAt !== null ? (engine.words[stoppedAt]?.word ?? "") : "";

	return (
		<Frame>
			<div
				className="flex h-full flex-col"
				data-testid="mini-window"
				data-word={engine.wordIndex}
				data-playing={engine.isPlaying}
				data-stopped={stoppedAt !== null}
			>
				<div className="flex items-center justify-between gap-2 bg-muted/60 px-3 py-1.5 text-muted-foreground text-xs">
					<span className="min-w-0 truncate">
						<span className="text-foreground">{start.title}</span> · {percent}%
					</span>
					<span className="shrink-0">
						{status === "playing"
							? "Playing · Space"
							: status === "taken-over"
								? "Paused · you moved in the reader"
								: "Paused · Space"}
					</span>
				</div>
				<button
					type="button"
					onClick={() => engine.togglePlayPause()}
					disabled={stoppedAt !== null}
					aria-label={engine.isPlaying ? "Pause" : "Play"}
					className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center px-4 font-serif text-[32px] leading-none"
					style={{ "--mini-focal": focalColor } as CSSProperties}
				>
					<span className="whitespace-pre text-right">{word.slice(0, orp)}</span>
					<span className="text-[var(--mini-focal)]">{word[orp] ?? ""}</span>
					<span className="whitespace-pre text-left">{word.slice(orp + 1)}</span>
				</button>
				<div className="flex items-center justify-center gap-1 pb-1 text-muted-foreground text-xs">
					<button
						type="button"
						aria-label="Previous word"
						onClick={() => engine.backWord()}
						className={controlClass}
					>
						<SkipBack className="size-3.5" />
					</button>
					<button
						type="button"
						aria-label={engine.isPlaying ? "Pause" : "Play"}
						onClick={() => engine.togglePlayPause()}
						className={`${controlClass} text-foreground`}
					>
						{engine.isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
					</button>
					<button
						type="button"
						aria-label="Next word"
						onClick={() => engine.forwardWord()}
						className={controlClass}
					>
						<SkipForward className="size-3.5" />
					</button>
					<RsvpSpeedControl wpm={settings.wpm} onChange={engine.changeWpm} compact />
				</div>
				<div className="h-[2px] w-full bg-muted">
					<div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
				</div>
			</div>
			{stoppedAt !== null && (
				<div
					className="absolute inset-0 grid place-items-center bg-background/95 px-5 text-center"
					data-testid="mini-stopped"
				>
					<div>
						<b className="block text-[15px]">Stopped at "{stoppedWord}"</b>
						<small className="text-muted-foreground">
							The book was closed in the main tab. Your place is saved.
						</small>
					</div>
				</div>
			)}
		</Frame>
	);
}
