import { Capacitor } from "@capacitor/core";
import { Button } from "@lesefluss/ui/button";
import { ShieldCheck } from "lucide-react";
import type React from "react";
import { PROVIDER_CHALLENGE_URL } from "../pages/explore/web-novels-providers";
import type { ProviderId } from "../services/serial-scrapers";
import { NativeHttp } from "../services/serial-scrapers/native-http";

type Props = { onResolved: () => void } & (
	| { provider: ProviderId; providers?: never }
	| { providers: ProviderId[]; provider?: never }
);

export const CloudflareChallenge: React.FC<Props> = (props) => {
	const list = "provider" in props && props.provider ? [props.provider] : (props.providers ?? []);
	if (!Capacitor.isNativePlatform() || list.length === 0) return null;

	return (
		<div className="flex flex-col gap-2 rounded-md border border-border bg-card px-3 py-2 text-card-foreground">
			<div className="flex items-center gap-1.5 font-semibold text-xs">
				<ShieldCheck className="size-4" />
				Cloudflare verification required
			</div>
			<div className="flex flex-wrap gap-2">
				{list.map((p) => {
					const challengeUrl = PROVIDER_CHALLENGE_URL[p];
					if (!challengeUrl) return null;
					return (
						<Button
							key={p}
							variant="outline"
							size="sm"
							onClick={() => {
								NativeHttp.openChallenge({
									url: challengeUrl,
									userAgent: navigator.userAgent,
								})
									.then(() => props.onResolved())
									.catch(() => {});
							}}
						>
							Verify {p}
						</Button>
					);
				})}
			</div>
		</div>
	);
};
