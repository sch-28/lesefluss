import { cn } from "@lesefluss/ui/utils";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { MessageCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import CoverImage from "@/components/cover-image";
import { useIsForeground } from "@/hooks/use-is-foreground";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { BuddyTrack, type TrackRider } from "./buddy-track";
import { useCurrentBook } from "./social-ui";

const TICK_MS = 550;
const LAST_TICK = 15;
/** How far a rider moves, in track percent, each time their schedule says so. */
const STEP = 2;
/**
 * The ticks on which each rider steps forward. Everyone takes 8 steps on their
 * own rhythm, and nobody is ever more than one step ahead of anyone else: that
 * bound is what keeps the spacing below intact on every tick.
 */
const SCHEDULES = {
	Ali: [0, 2, 4, 6, 8, 10, 12, 14],
	Mia: [1, 3, 5, 7, 9, 11, 13, 15],
	Jo: [0, 3, 4, 7, 8, 11, 12, 15],
	self: [1, 2, 5, 6, 9, 10, 13, 14],
} as const;
const TRAVEL = STEP * SCHEDULES.self.length;
/** Closest two riders may get, in track percent: the track is ~170px and an avatar 30px. */
export const MIN_GAP = 18;
/** Final spacing: the minimum plus the one step a neighbour may be ahead mid-run. */
const SPACING = MIN_GAP + STEP;
/** The reader furthest along, who leaves the note and finishes the chapter. */
const NOTE_READER = "Jo";
/** Ordered left to right along the track. */
const READERS = [
	{ name: "Ali", toneClassName: "bg-chart-2 text-background" },
	{ name: "Mia", toneClassName: "bg-muted-foreground text-background" },
	{ name: NOTE_READER, toneClassName: "bg-foreground/75 text-background" },
] as const;
/** Each caption shows from its tick on. */
const CAPTIONS: [number, string][] = [
	[0, "Everyone reads their own copy"],
	[3, "Mia picked up where she left off"],
	[6, "Jo left a note in chapter 11"],
	[8, "Jo reacted to chapter 11"],
	[11, "Ali caught up a little"],
	[13, "Jo finished chapter 12"],
	[LAST_TICK, "See where everyone is, live"],
];
const BUBBLE_TICKS = [8, 9, 10];
const BURST_TICK = 13;
const BURST_DOTS = Array.from({ length: 8 }, (_, i) => (Math.PI * 2 * i) / 8);
const DEMO_PERCENT = 42;

function stepsTaken(schedule: readonly number[], tick: number): number {
	return schedule.filter((t) => t <= tick).length;
}

function captionAt(tick: number): string {
	return CAPTIONS.filter(([from]) => from <= tick).at(-1)?.[1] ?? "";
}

/**
 * Everyone's position and step count at `tick`, ending with "You" at the
 * reader's real percent. "You" travels less when there is no room below, and
 * readers ahead keep that difference as extra distance. Readers take the free
 * spots closest to "You".
 */
export function trailerPositions(selfPercent: number, tick: number) {
	const selfTravel = Math.min(TRAVEL, selfPercent);
	const spots: number[] = [];
	for (let p = selfPercent - SPACING; p >= TRAVEL; p -= SPACING) spots.push(p);
	for (let p = selfPercent + SPACING + TRAVEL - selfTravel; p <= 100; p += SPACING) spots.push(p);
	const readerEnds = spots
		.sort((a, b) => Math.abs(a - selfPercent) - Math.abs(b - selfPercent))
		.slice(0, READERS.length)
		.sort((a, b) => a - b);
	const selfSteps = stepsTaken(SCHEDULES.self, tick);
	return {
		self: {
			percent:
				selfPercent - selfTravel + Math.round((selfTravel * selfSteps) / SCHEDULES.self.length),
			steps: selfSteps,
		},
		readers: READERS.map((reader, i) => {
			const steps = stepsTaken(SCHEDULES[reader.name], tick);
			return { percent: readerEnds[i] - TRAVEL + STEP * steps, steps };
		}),
	};
}

function DemoCover() {
	return (
		<div className="flex h-full flex-col justify-between bg-primary p-2 text-primary-foreground">
			<span className="font-serif text-[11px] uppercase leading-tight tracking-wide">
				Your next book
			</span>
			<span className="text-[8px] uppercase tracking-widest opacity-70">Lesefluss</span>
		</div>
	);
}

function NoteOverlay({ tick }: { tick: number }) {
	return (
		<>
			<AnimatePresence>
				{BUBBLE_TICKS.includes(tick) && (
					<motion.span
						initial={{ opacity: 0, y: 8, scale: 0.6 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ type: "spring", stiffness: 500, damping: 18 }}
						className="absolute bottom-12 flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-card px-2.5 py-1 font-medium text-[11px] text-foreground shadow-md"
					>
						<MessageCircle className="size-3" />
						That twist!
					</motion.span>
				)}
			</AnimatePresence>
			{BURST_DOTS.map((angle) => (
				<motion.span
					key={angle}
					className="absolute top-3 size-1.5 rounded-full bg-primary"
					initial={false}
					animate={
						tick >= BURST_TICK
							? {
									x: Math.cos(angle) * 24,
									y: Math.sin(angle) * 24,
									opacity: tick === BURST_TICK ? 1 : 0,
									scale: 1,
								}
							: { x: 0, y: 0, opacity: 0, scale: 0.3 }
					}
					transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
				/>
			))}
		</>
	);
}

/**
 * A short illustrated buddy read on the reader's own current book: three
 * made-up readers step along the shared track next to "You", each on their own
 * rhythm. Plays once while on screen and in the foreground, then rests on its
 * last frame.
 */
export function BuddyReadTrailer({
	self,
	className,
}: {
	/** The signed-in reader's own avatar; signed out, "You" shows as initials. */
	self?: { name: string; avatarUrl: string | null };
	className?: string;
}) {
	const book = useCurrentBook();
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { amount: 0.4 });
	const isForeground = useIsForeground();
	const prefersReducedMotion = usePrefersReducedMotion();
	const [tick, setTick] = useState(0);
	const shownTick = prefersReducedMotion ? LAST_TICK : tick;
	const isPlaying = !prefersReducedMotion && isInView && isForeground && tick < LAST_TICK;

	useEffect(() => {
		if (!isPlaying) return;
		const timer = setInterval(() => setTick((t) => Math.min(t + 1, LAST_TICK)), TICK_MS);
		return () => clearInterval(timer);
	}, [isPlaying]);

	const positions = trailerPositions(book?.percent ?? DEMO_PERCENT, shownTick);
	const riders: TrackRider[] = [
		...READERS.map((reader, i) => {
			const { percent, steps } = positions.readers[i];
			return {
				key: reader.name,
				name: reader.name,
				avatarUrl: null,
				percent,
				toneClassName: reader.toneClassName,
				label: `${percent}%`,
				hop: steps,
			};
		}),
		{
			key: "self",
			name: self?.name ?? "You",
			avatarUrl: self?.avatarUrl ?? null,
			percent: positions.self.percent,
			isSelf: true,
			toneClassName: "bg-primary text-primary-foreground",
			label: `You · ${positions.self.percent}%`,
			hop: positions.self.steps,
		},
	];

	return (
		<div ref={ref} className={cn("relative", className)}>
			<p className="sr-only">
				Preview of a buddy read: you and three friends read the same book and see each other's
				progress on one shared line.
			</p>
			<div aria-hidden="true" className="flex gap-3">
				<div className="relative aspect-[2/3] w-[60px] shrink-0 self-start overflow-hidden rounded-lg bg-muted shadow-[0_10px_28px_-8px_color-mix(in_oklch,var(--primary)_55%,transparent)]">
					{book ? <CoverImage src={book.coverSrc} alt="" /> : <DemoCover />}
				</div>
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0">
							<div className="truncate font-semibold text-foreground text-sm">
								{book?.title ?? "Any book you like"}
							</div>
							<div className="mt-0.5 text-[11px] text-muted-foreground">
								{riders.length} reading together
							</div>
						</div>
						<span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-bold text-[9.5px] text-muted-foreground uppercase tracking-wider">
							Preview
						</span>
					</div>
					<BuddyTrack
						riders={riders}
						isInstant={prefersReducedMotion}
						className="mt-6"
						renderOverlay={(rider) => rider.key === NOTE_READER && <NoteOverlay tick={shownTick} />}
					/>
				</div>
			</div>
			<div className="mt-1 flex min-h-7 items-center justify-between gap-2">
				<span aria-hidden="true" className="truncate text-[11.5px] text-muted-foreground">
					{captionAt(shownTick)}
				</span>
				{shownTick >= LAST_TICK && !prefersReducedMotion && (
					<button
						type="button"
						aria-label="Replay preview"
						onClick={() => setTick(0)}
						className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
					>
						<RotateCcw className="size-3.5" />
					</button>
				)}
			</div>
		</div>
	);
}
