import { Button } from "@lesefluss/ui/button";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useState } from "react";
import { IS_WEB_BUILD, openBrowserSignIn, SYNC_ENABLED, webSignInHref } from "@/services/sync";
import { TrailerCard } from "./first-run-hero";

/**
 * Shows what social reading looks like and starts the existing sign-in flow for the platform.
 * A deep link passes `title` and `message` to say what waits behind the sign-in.
 */
export function SignedOutSocial({
	returnTo,
	title = "Reading is better with company.",
	message = "Read the same book with friends, see where everyone is and talk about each chapter as you go.",
	isDemoBook = false,
}: {
	returnTo: string;
	title?: string;
	message?: string;
	isDemoBook?: boolean;
}) {
	const [isStarting, setIsStarting] = useState(false);

	const signIn = async () => {
		setIsStarting(true);
		if (IS_WEB_BUILD) {
			window.location.assign(webSignInHref(`/app${returnTo}`));
			return;
		}
		try {
			await openBrowserSignIn();
		} finally {
			setIsStarting(false);
		}
	};

	return (
		<TrailerCard isDemoBook={isDemoBook}>
			<h2 className="m-0 mt-6 font-bold text-[30px] text-foreground leading-[1.08] tracking-tight">
				{title}
			</h2>
			<p className="m-0 mt-3 text-[15px] text-muted-foreground leading-relaxed">{message}</p>
			{SYNC_ENABLED ? (
				<>
					<Button
						className="mt-6 w-full md:mx-auto md:flex md:w-fit"
						onClick={signIn}
						disabled={isStarting}
					>
						{isStarting ? "Opening sign-in…" : "Sign in to get started"}
					</Button>
					{!IS_WEB_BUILD && (
						<p className="m-0 mt-3 text-center text-muted-foreground text-xs">
							Browser not working on this device?{" "}
							<Link to="/tabs/settings/sync" className="touch-hit text-primary underline">
								More ways to sign in are in Settings
							</Link>
						</p>
					)}
				</>
			) : (
				<p className="m-0 mt-6 text-muted-foreground text-sm">
					Social features need a Lesefluss account, which this build does not support.
				</p>
			)}
			<p className="m-0 mt-4 flex items-start gap-2 text-muted-foreground text-xs leading-snug">
				<Lock className="mt-px size-3.5 shrink-0" />
				Private by design: no public search, people find you only through your invite link.
			</p>
		</TrailerCard>
	);
}
