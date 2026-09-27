import { Button } from "@lesefluss/ui/button";
import { GooglePlayIcon } from "~/components/icons/google-play";
import { PLAY_STORE_URL } from "~/lib/store-links";

/** Shown on the invite page for people without the app: install it, or continue in the web app. */
export function InviteAppCallToAction({ token }: { token: string }) {
	return (
		<div className="space-y-3 rounded-lg border border-border bg-card p-4 text-left">
			<p className="text-muted-foreground text-sm">
				Friends, shared books and buddy reads live in the Lesefluss app.
			</p>
			<a
				href={PLAY_STORE_URL}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-2.5 no-underline transition-colors hover:border-foreground/30"
			>
				<GooglePlayIcon className="h-5 w-5 fill-foreground" />
				<span className="text-left">
					<span className="block text-[10px] text-muted-foreground">Get it on</span>
					<span className="block font-semibold text-sm">Google Play</span>
				</span>
			</a>
			<Button asChild variant="ghost" size="sm" className="w-full">
				<a href={`/app/tabs/social/invite/${encodeURIComponent(token)}`}>Continue in the web app</a>
			</Button>
		</div>
	);
}
