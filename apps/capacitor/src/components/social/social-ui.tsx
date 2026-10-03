import type { ProfileCover } from "@lesefluss/core";
import { cn } from "@lesefluss/ui/utils";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import type React from "react";
import CoverImage from "@/components/cover-image";
import { getCoverUrl } from "@/services/catalog/client";
import { queryHooks } from "@/services/db/hooks";

/** A content section in the style of the stats page: large title, fade-in. */
export function SocialSection({
	title,
	subtitle,
	action,
	children,
	className,
}: {
	title?: string;
	subtitle?: string;
	action?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.2 }}
			transition={{ duration: 0.4 }}
			className={cn("mt-8 first:mt-4", className)}
		>
			{(title || action) && (
				<header className="mb-3 flex items-end justify-between gap-3 px-1">
					<div className="min-w-0">
						{title && <h2 className="m-0 font-semibold text-foreground text-lg">{title}</h2>}
						{subtitle && (
							<p className="m-0 mt-0.5 text-[11px] text-muted-foreground uppercase tracking-wider">
								{subtitle}
							</p>
						)}
					</div>
					{action}
				</header>
			)}
			{children}
		</motion.section>
	);
}

export function ProgressBar({
	percent,
	finished = false,
	className,
}: {
	percent: number | null;
	finished?: boolean;
	className?: string;
}) {
	return (
		<div className={cn("h-1.5 overflow-hidden rounded-full bg-current/10", className)}>
			<div
				className="h-full origin-left rounded-full bg-primary"
				style={{ transform: `scaleX(${(finished ? 100 : (percent ?? 0)) / 100})` }}
			/>
		</div>
	);
}

export function FinishedLabel({ className }: { className?: string }) {
	return (
		<span className={cn("inline-flex items-center gap-1 font-medium text-primary", className)}>
			<CheckCircle2 className="size-3.5" />
			Finished
		</span>
	);
}

export function StatTile({ value, label }: { value: string; label: string }) {
	return (
		<div className="rounded-xl border border-current/10 bg-card p-3 text-card-foreground">
			<div className="font-semibold text-xl tabular-nums leading-none tracking-tight">{value}</div>
			<div className="mt-1.5 text-[10px] uppercase tracking-wider opacity-60">{label}</div>
		</div>
	);
}

export type ShelfItem = {
	key: string;
	title: string;
	author: string | null;
	coverSrc: string | null;
	/** Drawn along the cover's bottom edge while between 0 and 100. */
	percent?: number;
	detail?: string;
};

/** A horizontal row of covers, as on the stats page. */
export function CoverShelf({ items }: { items: ShelfItem[] }) {
	return (
		<div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2">
			{items.map((item, index) => (
				<motion.div
					key={item.key}
					initial={{ opacity: 0, x: 16 }}
					whileInView={{ opacity: 1, x: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.4, delay: index * 0.06 }}
					className="w-[108px] flex-shrink-0 snap-start"
				>
					<div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted">
						<CoverImage src={item.coverSrc} alt={item.title} />
						<div className="absolute inset-0 bg-gradient-to-t from-foreground/50 via-transparent" />
						{item.percent !== undefined && item.percent > 0 && item.percent < 100 && (
							<div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
								<div className="h-full bg-primary" style={{ width: `${item.percent}%` }} />
							</div>
						)}
					</div>
					<div className="mt-2 px-0.5 text-foreground">
						<div className="line-clamp-1 font-medium text-sm">{item.title}</div>
						{item.author && (
							<div className="mt-0.5 line-clamp-1 text-[11px] opacity-60">{item.author}</div>
						)}
						{item.detail && (
							<div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground tabular-nums">
								{item.detail}
							</div>
						)}
					</div>
				</motion.div>
			))}
		</div>
	);
}

/** Rows of people or actions inside a content section. */
export function ListCard({ children }: { children: React.ReactNode }) {
	return (
		<div className="divide-y divide-border overflow-hidden rounded-xl border border-current/10 bg-card">
			{children}
		</div>
	);
}

/** A ring around the avatar, filled as far as the reader is in their current book. */
export function progressRing(percent: number): string {
	return `conic-gradient(var(--primary) ${percent}%, color-mix(in oklch, currentColor 12%, transparent) 0)`;
}

type CurrentBook = { id: string; title: string; coverSrc: string | null; percent: number };

/** The book the reader moved in most recently, if any is in progress. */
export function useCurrentBook(): CurrentBook | null {
	const reading = queryHooks.useStatsCurrentlyReading();
	const first = reading.data?.[0];
	const cover = useLocalCover(first?.id ?? "");
	if (!first) return null;
	return { id: first.id, title: first.title, coverSrc: cover, percent: first.percent ?? 0 };
}

/** A local book's cover: the stored image, else the catalog cover the book came from. */
export function useLocalCover(bookId: string): string | null {
	const { data: library } = queryHooks.useBooks();
	const stored = library?.covers.get(bookId);
	if (stored) return stored;
	const catalogId = library?.books.find((b) => b.id === bookId)?.catalogId;
	return catalogId ? getCoverUrl(catalogId) : null;
}

/** Where a cover the server described can be loaded from. */
export function profileCoverSrc(cover: ProfileCover): string | null {
	if (!cover) return null;
	return cover.kind === "catalog" ? getCoverUrl(cover.catalogId) : cover.url;
}
