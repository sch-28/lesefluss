import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { cn } from "@lesefluss/ui/utils";
import { motion } from "framer-motion";
import type React from "react";

export type TrackRider = {
	key: string;
	name: string;
	avatarUrl: string | null;
	percent: number;
	isSelf?: boolean;
	/** Avatar colours for a rider shown by initials only. */
	toneClassName?: string;
	label?: string;
	/** How many steps forward the rider has taken; each new step plays a small hop. */
	steps?: number;
};

const SPRING = { type: "spring", stiffness: 120, damping: 20 } as const;
const INSTANT = { duration: 0 } as const;
const HOP = { type: "spring", stiffness: 400, damping: 11 } as const;

function clampPercent(percent: number): number {
	return Math.min(100, Math.max(0, percent));
}

/**
 * Everyone in a buddy read on one shared line. Each rider is a layer as wide as
 * the track, shifted by its percent, so movement stays a transform. The wrapper
 * clips sideways only, so overlays above the avatars stay visible; its padding
 * leaves room for half the widest label ("You · 100%") at either end. On a
 * narrow track the avatars shrink and only "You" keeps a label, so riders kept
 * 18% apart never collide.
 */
export function BuddyTrack({
	riders,
	isInstant = false,
	className,
	renderOverlay,
}: {
	riders: TrackRider[];
	isInstant?: boolean;
	className?: string;
	renderOverlay?: (rider: TrackRider) => React.ReactNode;
}) {
	const leader = Math.max(0, ...riders.map((r) => clampPercent(r.percent)));
	const transition = isInstant ? INSTANT : SPRING;
	return (
		<div className={cn("@container overflow-x-clip px-6", className)}>
			<div className="relative h-14">
				<div className="absolute inset-x-0 top-[18px] h-1.5 rounded-full bg-current/10" />
				<motion.div
					className="absolute inset-x-0 top-[18px] h-1.5 origin-left rounded-full bg-primary/30"
					initial={false}
					animate={{ scaleX: leader / 100 }}
					transition={transition}
				/>
				{riders.map((rider) => (
					<motion.div
						key={rider.key}
						className={cn("pointer-events-none absolute inset-x-0 top-1", rider.isSelf && "z-10")}
						initial={false}
						animate={{ x: `${clampPercent(rider.percent)}%` }}
						transition={transition}
					>
						<div className="absolute left-0 flex -translate-x-1/2 flex-col items-center">
							{renderOverlay?.(rider)}
							<motion.span
								key={rider.steps}
								className={cn(
									"rounded-full bg-card ring-2 ring-card",
									rider.isSelf && "outline-2 outline-primary outline-offset-2",
								)}
								initial={rider.steps && !isInstant ? { y: -4.5 } : false}
								animate={{ y: 0 }}
								transition={HOP}
							>
								<SocialAvatar
									name={rider.name}
									avatarUrl={rider.avatarUrl}
									size="sm"
									className={cn(
										"size-[min(30px,calc(18cqw-4px))] text-[11px]",
										rider.toneClassName,
									)}
								/>
							</motion.span>
							{rider.label && (
								<span
									className={cn(
										"mt-1.5 whitespace-nowrap font-semibold text-[10px] tabular-nums",
										rider.isSelf ? "text-foreground" : "@max-[180px]:hidden text-muted-foreground",
									)}
								>
									{rider.label}
								</span>
							)}
						</div>
					</motion.div>
				))}
			</div>
		</div>
	);
}
