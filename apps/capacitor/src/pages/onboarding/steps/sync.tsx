import { Browser } from "@capacitor/browser";
import { Cloud, Loader2, Users } from "lucide-react";
import type React from "react";
import { useCallback, useEffect } from "react";
import { HandleClaimStep } from "../../../components/social/handle-claim-step";
import { useSyncContext } from "../../../contexts/sync-context";
import { useOwnSocialProfile } from "../../../services/social/profile";
import { beginAuthLoginHandoff, IS_WEB_BUILD } from "../../../services/sync";
import { SYNC_URL } from "../../../services/sync/auth-client";
import { useOnboardingFooter } from "../footer-context";

function SignInStep() {
	const { finish, setFooter } = useOnboardingFooter();

	const signIn = useCallback(async () => {
		if (IS_WEB_BUILD) {
			await finish();
			window.location.href = "/login";
			return;
		}
		const state = await beginAuthLoginHandoff();
		await finish();
		await Browser.open({
			url: `${SYNC_URL}/auth/mobile-callback?state=${encodeURIComponent(state)}`,
		});
	}, [finish]);

	useEffect(() => {
		setFooter({
			primary: { label: "Sign in", onClick: signIn },
			secondary: { label: "Not now", onClick: finish },
		});
	}, [signIn, finish, setFooter]);

	return (
		<div className="flex flex-col items-center text-center">
			<div className="mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
				<Cloud className="size-8 text-primary" />
			</div>
			<h2 className="font-semibold text-2xl tracking-tight">Sync across devices?</h2>
			<p className="mt-3 max-w-sm text-muted-foreground leading-relaxed">
				Sign in to keep your library, progress, and highlights in step across phones and web.
				Optional — you can do this later in Settings.
			</p>
		</div>
	);
}

/** Already signed in: offer a handle instead of the sign-in prompt. Skippable. */
function HandleStep() {
	const { finish, setFooter } = useOnboardingFooter();
	const profile = useOwnSocialProfile();

	useEffect(() => {
		setFooter({ primary: { label: "Not now", onClick: finish } });
	}, [finish, setFooter]);

	return (
		<div className="flex flex-col">
			<div className="mb-6 flex flex-col items-center text-center">
				<div className="mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
					<Users className="size-8 text-primary" />
				</div>
				<h2 className="font-semibold text-2xl tracking-tight">Pick a handle</h2>
				<p className="mt-3 max-w-sm text-muted-foreground leading-relaxed">
					Friends will know you by it. Optional — you can set it later in Settings.
				</p>
			</div>
			{profile.isPending ? (
				<div className="flex justify-center py-6">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			) : profile.isError ? (
				<p className="text-center text-muted-foreground text-sm">
					Can't reach the server right now. You can pick a handle later in Settings.
				</p>
			) : (
				<HandleClaimStep profile={profile.data} onClaimed={() => finish()} />
			)}
		</div>
	);
}

const SyncStep: React.FC = () => {
	const { isLoggedIn, isSessionResolved } = useSyncContext();
	if (!isSessionResolved) {
		return (
			<div className="flex justify-center py-16">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}
	return isLoggedIn ? <HandleStep /> : <SignInStep />;
};

export default SyncStep;
