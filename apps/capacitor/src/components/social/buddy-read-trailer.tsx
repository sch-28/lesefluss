import {
	BUDDY_TRAILER_BUBBLE_TICKS,
	BUDDY_TRAILER_BURST_TICK,
	BUDDY_TRAILER_NOTE_READER,
	BUDDY_TRAILER_READERS,
	buddyTrailerCaptionAt,
	buddyTrailerPositions,
} from "@lesefluss/core";
import {
	BUDDY_TRAILER_BURST_DOTS,
	BUDDY_TRAILER_READER_TONES,
	useBuddyTrailerTick,
} from "@lesefluss/ui/buddy-trailer";
import { cn } from "@lesefluss/ui/utils";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { MessageCircle, RotateCcw } from "lucide-react";
import { useRef } from "react";
import CoverImage from "@/components/cover-image";
import { useIsForeground } from "@/hooks/use-is-foreground";
import { BuddyTrack, type TrackRider } from "./buddy-track";
import { useCurrentBook } from "./social-ui";

const DEMO_PERCENT = 42;

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
				{BUDDY_TRAILER_BUBBLE_TICKS.includes(tick) && (
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
			{BUDDY_TRAILER_BURST_DOTS.map((dot) => (
				<motion.span
					key={dot.key}
					className="absolute top-3 size-1.5 rounded-full bg-primary"
					initial={false}
					animate={
						tick >= BUDDY_TRAILER_BURST_TICK
							? {
									x: dot.x,
									y: dot.y,
									opacity: tick === BUDDY_TRAILER_BURST_TICK ? 1 : 0,
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
	const { tick, prefersReducedMotion, canReplay, replay } = useBuddyTrailerTick(
		isInView && isForeground,
	);

	const positions = buddyTrailerPositions(book?.percent ?? DEMO_PERCENT, tick);
	const riders: TrackRider[] = [
		...BUDDY_TRAILER_READERS.map((name, i) => {
			const { percent, steps } = positions.readers[i];
			return {
				key: name,
				name,
				avatarUrl: null,
				percent,
				toneClassName: BUDDY_TRAILER_READER_TONES[name],
				label: `${percent}%`,
				steps,
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
			steps: positions.self.steps,
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
						renderOverlay={(rider) =>
							rider.key === BUDDY_TRAILER_NOTE_READER && <NoteOverlay tick={tick} />
						}
					/>
				</div>
			</div>
			<div className="mt-1 flex min-h-7 items-center justify-between gap-2">
				<span aria-hidden="true" className="truncate text-[11.5px] text-muted-foreground">
					{buddyTrailerCaptionAt(tick)}
				</span>
				{canReplay && (
					<button
						type="button"
						aria-label="Replay preview"
						onClick={replay}
						className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
					>
						<RotateCcw className="size-3.5" />
					</button>
				)}
			</div>
		</div>
	);
}
