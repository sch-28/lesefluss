import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { Link } from "@tanstack/react-router";
import { BellOff } from "lucide-react";
import { CARD_SURFACE } from "@/components/card";
import { openPushOffer, usePushPermission } from "@/services/push/offer";

/** Shown only while this phone has notifications off; a denied permission can only be fixed in system settings. */
export function EnableNotificationsRow() {
	const permission = usePushPermission();
	if (permission.data !== "prompt" && permission.data !== "denied") return null;
	return (
		<div className={cn(CARD_SURFACE, "mt-3 flex items-center gap-3 px-4 py-3")}>
			<BellOff className="size-5 shrink-0 text-muted-foreground" />
			<p className="min-w-0 flex-1 text-muted-foreground text-sm">
				Get notified about new requests, shares and replies.
			</p>
			{permission.data === "prompt" ? (
				<Button size="sm" onClick={openPushOffer}>
					Enable notifications
				</Button>
			) : (
				<Button size="sm" variant="outline" asChild>
					<Link to="/tabs/settings/notifications">How to enable</Link>
				</Button>
			)}
		</div>
	);
}
