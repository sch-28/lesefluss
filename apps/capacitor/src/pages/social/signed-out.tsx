import { Browser } from "@capacitor/browser";
import { Button } from "@lesefluss/ui/button";
import { Users } from "lucide-react";
import { useState } from "react";
import { beginAuthLoginHandoff, IS_WEB_BUILD, SYNC_ENABLED } from "@/services/sync";
import { SYNC_URL } from "@/services/sync/auth-client";

/** Explains social features and starts the existing sign-in flow for the platform. */
export function SignedOutSocial({ returnTo }: { returnTo: string }) {
	const [isStarting, setIsStarting] = useState(false);

	const signIn = async () => {
		setIsStarting(true);
		if (IS_WEB_BUILD) {
			window.location.assign(`/login?redirect=${encodeURIComponent(`/app${returnTo}`)}`);
			return;
		}
		const state = await beginAuthLoginHandoff();
		await Browser.open({
			url: `${SYNC_URL}/auth/mobile-callback?state=${encodeURIComponent(state)}`,
		});
		setIsStarting(false);
	};

	return (
		<div className="mx-auto mt-6 flex max-w-sm flex-col items-center text-center">
			<div className="mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
				<Users className="size-8 text-primary" />
			</div>
			<h2 className="font-semibold text-2xl tracking-tight">Read with friends</h2>
			<p className="mt-3 text-muted-foreground leading-relaxed">
				Add friends with a personal invite link, see what they read, share books and read together.
				There is no search: people connect only through invites.
			</p>
			{SYNC_ENABLED ? (
				<Button className="mt-6 w-full" onClick={signIn} disabled={isStarting}>
					{isStarting ? "Opening sign-in…" : "Sign in to get started"}
				</Button>
			) : (
				<p className="mt-6 text-muted-foreground text-sm">
					Social features need a Lesefluss account, which this build does not support.
				</p>
			)}
		</div>
	);
}
