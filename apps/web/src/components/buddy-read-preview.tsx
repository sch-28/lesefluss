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
import { MessageCircle, RotateCcw } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";

const SELF_PERCENT = 42;
const GLIDE =
	"transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none";

function useIsInView(ref: React.RefObject<HTMLElement | null>): boolean {
	const [isInView, setIsInView] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			([entry]) => setIsInView(entry?.isIntersecting ?? false),
			{ threshold: 0.4 },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref]);
	return isInView;
}

type Rider = {
	key: string;
	initials: string;
	percent: number;
	steps: number;
	label: string;
	toneClassName: string;
	isSelf?: boolean;
};

function NoteOverlay({ tick }: { tick: number }) {
	const isBubbleShown = BUDDY_TRAILER_BUBBLE_TICKS.includes(tick);
	const isBurstOut = tick >= BUDDY_TRAILER_BURST_TICK;
	return (
		<>
			<span
				className={cn(
					"absolute bottom-12 flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-card px-2.5 py-1 font-medium text-[11px] text-foreground shadow-md transition-[opacity,transform] duration-300 motion-reduce:transition-none",
					isBubbleShown
						? "translate-y-0 scale-100 opacity-100"
						: "translate-y-2 scale-75 opacity-0",
				)}
			>
				<MessageCircle className="size-3" />
				That twist!
			</span>
			{BUDDY_TRAILER_BURST_DOTS.map((dot) => (
				<span
					key={dot.key}
					className="absolute top-3 size-1.5 rounded-full bg-primary transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
					style={{
						transform: isBurstOut ? `translate(${dot.x}px, ${dot.y}px)` : "scale(0.3)",
						opacity: tick === BUDDY_TRAILER_BURST_TICK ? 1 : 0,
					}}
				/>
			))}
		</>
	);
}

/**
 * The buddy-read preview from the app's Social tab for the landing page: three
 * illustrated readers and "You" step along one track on a classic's cover. CSS
 * transitions only; plays once in view and rests on its last frame. On a narrow
 * track the avatars shrink and only "You" keeps a label, so riders kept 18%
 * apart never collide.
 */
export function BuddyReadPreview({ coverUrl, title }: { coverUrl: string; title: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const { tick, canReplay, replay } = useBuddyTrailerTick(useIsInView(ref));

	const positions = buddyTrailerPositions(SELF_PERCENT, tick);
	const riders: Rider[] = [
		...BUDDY_TRAILER_READERS.map((name, i) => {
			const { percent, steps } = positions.readers[i];
			return {
				key: name,
				initials: name[0] ?? "",
				percent,
				steps,
				label: `${percent}%`,
				toneClassName: BUDDY_TRAILER_READER_TONES[name],
			};
		}),
		{
			key: "self",
			initials: "Y",
			percent: positions.self.percent,
			steps: positions.self.steps,
			label: `You · ${positions.self.percent}%`,
			toneClassName: "bg-primary text-primary-foreground",
			isSelf: true,
		},
	];
	const leader = Math.max(...riders.map((r) => r.percent));

	return (
		<div ref={ref} className="relative">
			<p className="sr-only">
				Preview of a buddy read: you and three friends read the same book and see each other's
				progress on one shared line.
			</p>
			<div aria-hidden="true" className="flex gap-3.5">
				<div className="relative aspect-[2/3] w-[68px] shrink-0 self-start overflow-hidden rounded-lg bg-muted shadow-[0_10px_28px_-8px_color-mix(in_oklch,var(--primary)_55%,transparent)]">
					<img
						src={coverUrl}
						alt=""
						draggable={false}
						decoding="async"
						loading="lazy"
						className="block size-full object-cover"
					/>
				</div>
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0">
							<div className="truncate font-semibold text-foreground text-sm">{title}</div>
							<div className="mt-0.5 text-[11px] text-muted-foreground">
								{riders.length} reading together
							</div>
						</div>
						<span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-bold text-[9.5px] text-muted-foreground uppercase tracking-wider">
							Preview
						</span>
					</div>
					<div className="@container mt-6 overflow-x-clip px-6">
						<div className="relative h-14">
							<div className="absolute inset-x-0 top-[18px] h-1.5 rounded-full bg-current/10" />
							<div
								className={cn(
									"absolute inset-x-0 top-[18px] h-1.5 origin-left rounded-full bg-primary/30",
									GLIDE,
								)}
								style={{ transform: `scaleX(${leader / 100})` }}
							/>
							{riders.map((rider) => (
								<div
									key={rider.key}
									className={cn(
										"pointer-events-none absolute inset-x-0 top-1",
										GLIDE,
										rider.isSelf && "z-10",
									)}
									style={{ transform: `translateX(${rider.percent}%)` }}
								>
									<div className="absolute left-0 flex -translate-x-1/2 flex-col items-center">
										{rider.key === BUDDY_TRAILER_NOTE_READER && <NoteOverlay tick={tick} />}
										<span
											key={rider.steps}
											className={cn(
												"flex size-[min(30px,calc(18cqw-4px))] items-center justify-center rounded-full font-semibold text-[11px] ring-2 ring-card",
												rider.steps > 0 &&
													"animate-[trailer-hop_450ms_cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:animate-none",
												rider.toneClassName,
												rider.isSelf && "outline-2 outline-primary outline-offset-2",
											)}
										>
											{rider.initials}
										</span>
										<span
											className={cn(
												"mt-1.5 whitespace-nowrap font-semibold text-[10px] tabular-nums",
												rider.isSelf
													? "text-foreground"
													: "@max-[180px]:hidden text-muted-foreground",
											)}
										>
											{rider.label}
										</span>
									</div>
								</div>
							))}
						</div>
					</div>
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
