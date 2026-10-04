import { Button } from "@lesefluss/ui/button";
import { GooglePlayBadge } from "~/components/google-play-badge";
import { appInviteIntentUrl } from "~/lib/store-links";
import { useIsAndroid } from "~/lib/use-is-android";

export function InviteAppCallToAction({ token }: { token: string }) {
	const isAndroid = useIsAndroid();
	return (
		<div className="mt-6 space-y-3 px-1 text-center">
			<p className="text-muted-foreground text-sm">
				Friends, shared books and buddy reads live in the Lesefluss app.
			</p>
			{isAndroid && (
				<Button asChild variant="outline" className="h-11 w-full rounded-xl">
					<a href={appInviteIntentUrl(token)}>Open in Lesefluss</a>
				</Button>
			)}
			<GooglePlayBadge className="w-full justify-center" />
			<Button asChild variant="ghost" size="sm" className="w-full">
				<a href={`/app/tabs/social/invite/${encodeURIComponent(token)}`}>Continue in the web app</a>
			</Button>
		</div>
	);
}
