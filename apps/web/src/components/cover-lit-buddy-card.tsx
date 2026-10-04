import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { BuddyReadPreview } from "~/components/buddy-read-preview";

const PREVIEW_COVER = {
	url: "/covers/jane-austen__pride-and-prejudice.webp",
	title: "Pride and Prejudice",
};

/** The buddy-read preview on a card lit by its blurred cover. */
export function CoverLitBuddyCard({
	className,
	isAboveFold = false,
	children,
}: {
	className?: string;
	isAboveFold?: boolean;
	children?: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-3xl border border-border bg-card shadow-[0_30px_60px_-30px_rgba(24,24,27,0.35)]",
				className,
			)}
		>
			<div aria-hidden="true" className="pointer-events-none absolute inset-0">
				<img
					src={PREVIEW_COVER.url}
					alt=""
					draggable={false}
					loading={isAboveFold ? "eager" : "lazy"}
					decoding="async"
					className="absolute inset-0 size-full scale-150 object-cover opacity-25 blur-2xl"
				/>
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_60%)]" />
				<div className="absolute inset-0 bg-gradient-to-b from-card/30 via-35% via-card/80 to-80% to-card" />
			</div>
			<div className="relative p-4 sm:p-5">
				<div className="rounded-2xl border border-border bg-card/85 p-3.5 sm:p-4">
					<BuddyReadPreview coverUrl={PREVIEW_COVER.url} title={PREVIEW_COVER.title} />
				</div>
				{children}
			</div>
		</div>
	);
}
