import { cn } from "@lesefluss/ui/utils";

/** A stable hue per title, so one book keeps its tint across every screen. */
export function titleHue(title: string): number {
	let hash = 0;
	for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0;
	return Math.abs(hash) % 360;
}

/**
 * The one stand-in for a missing cover: title and author on a tinted card.
 * `tint` overrides the title-derived colour (web novels use their provider's).
 */
export function TextCover({
	title,
	author,
	tint,
	compact = false,
	className,
}: {
	title: string;
	author?: string | null;
	tint?: string;
	/** For covers under about 4rem wide: smaller title, no author. */
	compact?: boolean;
	className?: string;
}) {
	const base = tint ?? `oklch(0.45 0.07 ${titleHue(title)})`;
	return (
		<div
			data-testid="text-cover"
			// The title and author are always printed beside the cover, so the stand-in stays out of names.
			aria-hidden
			className={cn(
				"absolute inset-0 flex flex-col justify-end gap-1 p-2 text-left text-white",
				compact && "p-1",
				className,
			)}
			style={{
				background: `linear-gradient(160deg, ${base}, color-mix(in srgb, ${base} 55%, black))`,
			}}
		>
			<span
				className={cn(
					"overflow-hidden break-words font-semibold leading-tight [-webkit-box-orient:vertical] [display:-webkit-box]",
					compact ? "text-[0.55rem] [-webkit-line-clamp:3]" : "text-xs [-webkit-line-clamp:4]",
				)}
			>
				{title}
			</span>
			{author && !compact && <span className="truncate text-[0.6rem] text-white/75">{author}</span>}
		</div>
	);
}
