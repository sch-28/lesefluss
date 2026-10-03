import { Button } from "@lesefluss/ui/button";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useState } from "react";
import { IS_WEB_BUILD, openBrowserSignIn, SYNC_ENABLED } from "@/services/sync";
import { TrailerCard } from "./first-run-hero";

/** Shows what social reading looks like and starts the existing sign-in flow for the platform. */
export function SignedOutSocial({ returnTo }: { returnTo: string }) {
	const [isStarting, setIsStarting] = useState(false);

	const signIn = async () => {
		setIsStarting(true);
		if (IS_WEB_BUILD) {
			window.location.assign(`/login?redirect=${encodeURIComponent(`/app${returnTo}`)}`);
			return;
		}
		try {
			await openBrowserSignIn();
		} finally {
			setIsStarting(false);
		}
	};

	return (
		<TrailerCard>
			<h2 className="m-0 mt-6 font-bold text-[30px] text-foreground leading-[1.08] tracking-tight">
				Reading is better with company.
			</h2>
			<p className="m-0 mt-3 text-[15px] text-muted-foreground leading-relaxed">
				Read the same book with friends, see where everyone is and talk about each chapter as you
				go.
			</p>
			{SYNC_ENABLED ? (
				<>
					<Button
						size="lg"
						className="mt-6 h-12 w-full rounded-xl"
						onClick={signIn}
						disabled={isStarting}
					>
						{isStarting ? "Opening sign-in…" : "Sign in to get started"}
					</Button>
					{!IS_WEB_BUILD && (
						<p className="m-0 mt-3 text-center text-muted-foreground text-xs">
							Browser not working on this device?{" "}
							<Link to="/tabs/settings/sync" className="text-primary underline">
								Sign in with email or your phone in Settings
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
