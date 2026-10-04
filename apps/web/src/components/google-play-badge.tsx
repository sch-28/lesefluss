import { cn } from "@lesefluss/ui/utils";
import { GooglePlayIcon } from "~/components/icons/google-play";
import { PLAY_STORE_URL } from "~/lib/store-links";

export function GooglePlayBadge({ className }: { className?: string }) {
	return (
		<a
			href={PLAY_STORE_URL}
			target="_blank"
			rel="noopener noreferrer"
			className={cn(
				"inline-flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 no-underline transition-colors hover:border-foreground/30",
				className,
			)}
		>
			<GooglePlayIcon className="h-6 w-6 fill-foreground" />
			<span className="text-left">
				<span className="block text-[10px] text-muted-foreground">Get it on</span>
				<span className="block font-semibold text-foreground text-sm">Google Play</span>
			</span>
		</a>
	);
}
