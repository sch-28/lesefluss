import { Capacitor } from "@capacitor/core";
import { IonButton, IonIcon } from "@ionic/react";
import { shieldCheckmarkOutline } from "ionicons/icons";
import type React from "react";
import { PROVIDER_CHALLENGE_URL } from "../pages/explore/web-novels-providers";
import type { ProviderId } from "../services/serial-scrapers";
import { NativeHttp } from "../services/serial-scrapers/native-http";

type Props = { onResolved: () => void } & (
	| { provider: ProviderId; providers?: never }
	| { providers: ProviderId[]; provider?: never }
);

const iconStyle = { fontSize: "1rem" };

export const CloudflareChallenge: React.FC<Props> = (props) => {
	const list = "provider" in props && props.provider ? [props.provider] : (props.providers ?? []);
	if (!Capacitor.isNativePlatform() || list.length === 0) return null;

	return (
		<div className="flex flex-col gap-2 rounded-md border border-[var(--ion-border-color,#c8c7cc)] bg-[var(--ion-card-background,#ffffff)] px-3 py-2">
			<div className="flex items-center gap-1.5 font-semibold text-[color:var(--ion-text-color,#000000)] text-xs">
				<IonIcon icon={shieldCheckmarkOutline} style={iconStyle} />
				Cloudflare verification required
			</div>
			<div className="flex flex-wrap gap-2">
				{list.map((p) => {
					const challengeUrl = PROVIDER_CHALLENGE_URL[p];
					if (!challengeUrl) return null;
					return (
						<IonButton
							key={p}
							size="small"
							fill="outline"
							color="dark"
							onClick={() => {
								NativeHttp.openChallenge({ url: challengeUrl, userAgent: navigator.userAgent })
									.then(() => props.onResolved())
									.catch(() => {});
							}}
						>
							Verify {p}
						</IonButton>
					);
				})}
			</div>
		</div>
	);
};
