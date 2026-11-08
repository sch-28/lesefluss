import { Button } from "@lesefluss/ui/button";
import { Cloud } from "lucide-react";
import { SettingsSection } from "@/components/settings/settings-section";
import { useSyncContext } from "@/contexts/sync-context";
import { IS_WEB_BUILD, SYNC_ENABLED, webSignInHref } from "@/services/sync";
import { SignInOptions } from "./sign-in-options";

/** A signed-out screen's "Not signed in" section: what an account gives here, and the way in. */
export function SignInPanel({ benefit }: { benefit: string }) {
	const { syncError } = useSyncContext();
	return (
		<SettingsSection title="Not signed in">
			<div className="flex items-center gap-3 px-4 py-3">
				<Cloud className="size-5 shrink-0 text-muted-foreground" />
				<p className="text-muted-foreground text-sm">
					{SYNC_ENABLED ? benefit : "This build has no Lesefluss account support."}
				</p>
			</div>
			{syncError && <div className="px-4 py-2 text-destructive text-sm">{syncError}</div>}
			{SYNC_ENABLED && (
				<div className="p-3">
					{IS_WEB_BUILD ? (
						<Button asChild className="w-full">
							<a
								href={webSignInHref(window.location.pathname + window.location.search)}
								target="_top"
								rel="noreferrer"
							>
								Sign in
							</a>
						</Button>
					) : (
						<SignInOptions />
					)}
				</div>
			)}
		</SettingsSection>
	);
}
