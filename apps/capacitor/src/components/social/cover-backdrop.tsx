import { cn } from "@lesefluss/ui/utils";
import { proxyImageUrl } from "@/services/catalog/client";

/**
 * A book cover blurred behind a card, washed in the theme's primary colour and
 * faded into the card colour so text on top stays readable. Static on purpose:
 * animating a blur repaints the whole layer every frame on Android WebViews.
 */
export function CoverBackdrop({ src, className }: { src: string | null; className?: string }) {
	const resolved = proxyImageUrl(src);
	return (
		<div
			aria-hidden="true"
			className={cn("cover-backdrop pointer-events-none absolute inset-0", className)}
		>
			{resolved && (
				<img
					src={resolved}
					alt=""
					draggable={false}
					decoding="async"
					className="absolute inset-0 size-full scale-150 object-cover opacity-45 sepia:opacity-30 blur-2xl dark:opacity-60"
				/>
			)}
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,color-mix(in_oklch,var(--primary)_36%,transparent),transparent_60%),radial-gradient(circle_at_100%_40%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_55%)]" />
			<div className="absolute inset-0 bg-gradient-to-b from-card/10 via-35% via-card/75 to-70% to-card" />
		</div>
	);
}
