import { BookOpen } from "lucide-react";

/** A stable hue per title, so one book keeps its tint across every screen. */
export function titleHue(title: string): number {
	let hash = 0;
	for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0;
	return Math.abs(hash) % 360;
}

/**
 * The one stand-in for a missing cover: a tinted card with a book glyph. It carries no
 * text because every cover in the app has its title printed beside or below it.
 * `tint` overrides the title-derived colour (web novels use their provider's).
 */
export function TintedCover({
	title,
	tint,
	compact = false,
}: {
	title: string;
	tint?: string;
	/** For covers under about 4rem wide: a smaller glyph. */
	compact?: boolean;
}) {
	const base = tint ?? `oklch(0.45 0.07 ${titleHue(title)})`;
	return (
		<div
			data-testid="tinted-cover"
			aria-hidden
			className="absolute inset-0 flex items-center justify-center text-white/60"
			style={{
				background: `linear-gradient(160deg, ${base}, color-mix(in srgb, ${base} 55%, black))`,
			}}
		>
			<BookOpen className={compact ? "size-4" : "size-6"} />
		</div>
	);
}
