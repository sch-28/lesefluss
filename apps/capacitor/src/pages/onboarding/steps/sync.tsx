import { Browser } from "@capacitor/browser";
import { Cloud } from "lucide-react";
import type React from "react";
import { useCallback, useEffect } from "react";
import { beginAuthLoginHandoff, IS_WEB_BUILD } from "../../../services/sync";
import { SYNC_URL } from "../../../services/sync/auth-client";
import { useOnboardingFooter } from "../footer-context";

const SyncStep: React.FC = () => {
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
};

export default SyncStep;
