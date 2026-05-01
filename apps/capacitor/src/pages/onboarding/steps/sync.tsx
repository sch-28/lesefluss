import { Browser } from "@capacitor/browser";
import { IonIcon } from "@ionic/react";
import { cloudOutline } from "ionicons/icons";
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
			// Mark onboarding complete before navigating so the flag is persisted before
			// the full-page redirect kills any in-flight mutation.
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
		<div className="onboarding-step">
			<IonIcon icon={cloudOutline} className="onboarding-sync-icon" />
			<h2 className="onboarding-step-title">Sync across devices?</h2>
			<p className="onboarding-step-sub">
				Sign in to keep your library, progress, and highlights in step across phones and web.
				Optional — you can do this later in Settings.
			</p>
			<div className="onboarding-actions">
				<button type="button" className="onboarding-btn onboarding-btn--primary" onClick={signIn}>
					Sign in
				</button>
				<button type="button" className="onboarding-btn onboarding-btn--primary" onClick={onFinish}>
					Not now
				</button>
			</div>
		</div>
	);
};

export default SyncStep;
