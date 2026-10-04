import { useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";
import { pushPermissionKey } from "@/services/db/hooks/query-keys";
import { markPushPermissionAsked, requestPushPermission } from "@/services/push";
import { closePushOffer, usePushOfferOpen } from "@/services/push/offer";
import { log } from "@/utils/log";

/** The explainer before the OS prompt, so the prompt never arrives without context. */
export function PushOfferDialog() {
	const isOpen = usePushOfferOpen();
	const client = useQueryClient();

	const handleTurnOn = async () => {
		try {
			const permission = await requestPushPermission();
			if (permission === "denied") {
				toast.error("Notifications are off. You can turn them on in your phone's settings.");
			}
		} catch (err) {
			log.warn("push", "permission request failed:", err);
		} finally {
			void client.invalidateQueries({ queryKey: pushPermissionKey });
		}
	};

	return (
		<ConfirmDialog
			open={isOpen}
			onOpenChange={(open) => {
				if (open) return;
				closePushOffer();
				void markPushPermissionAsked();
			}}
			title="Turn on notifications?"
			description="Hear about friend requests, shared books, buddy-read invites and replies to you, even when Lesefluss is closed. You choose which in Settings."
			confirmLabel="Turn on"
			cancelLabel="Not now"
			onConfirm={() => void handleTurnOn()}
		/>
	);
}
