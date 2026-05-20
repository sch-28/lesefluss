import { Browser } from "@capacitor/browser";
import { Button } from "@lesefluss/ui/button";
import { Cloud } from "lucide-react";
import type React from "react";
import { useCallback } from "react";
import { beginAuthLoginHandoff, IS_WEB_BUILD } from "../../../services/sync";
import { SYNC_URL } from "../../../services/sync/auth-client";

interface Props {
	onFinish: () => Promise<void>;
}

const SyncStep: React.FC<Props> = ({ onFinish }) => {
	const signIn = useCallback(async () => {
		if (IS_WEB_BUILD) {
			// Mark onboarding complete before navigating so the flag is persisted
			// before the full-page redirect kills any in-flight mutation.
			await onFinish();
			window.location.href = "/login";
			return;
		}
		const state = await beginAuthLoginHandoff();
		await onFinish();
		await Browser.open({
			url: `${SYNC_URL}/auth/mobile-callback?state=${encodeURIComponent(state)}`,
		});
	}, [onFinish]);

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
			<div className="mt-10 flex w-full max-w-xs flex-col gap-3">
				<Button size="lg" onClick={signIn}>
					Sign in
				</Button>
				<Button size="lg" variant="outline" onClick={onFinish}>
					Not now
				</Button>
			</div>
		</div>
	);
};

export default SyncStep;
