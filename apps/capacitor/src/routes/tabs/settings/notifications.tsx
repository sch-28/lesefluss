import { PUSH_PREVIEW_MAX_CHARS, type PushPreferencesPatch } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { ToggleRow } from "@/components/app-shell/toggle-row";
import { SettingsSection } from "@/components/settings/settings-section";
import { toast } from "@/components/toast";
import { useSyncContext } from "@/contexts/sync-context";
import { OfflineNotice } from "@/pages/social/social-gate";
import { openPushOffer, usePushPermission } from "@/services/push/offer";
import { usePushPreferences, useUpdatePushPreferences } from "@/services/push/preferences";

export const Route = createFileRoute("/tabs/settings/notifications")({
	component: NotificationSettings,
});

function Spinner() {
	return (
		<div className="flex justify-center py-16">
			<Loader2 className="size-6 animate-spin text-muted-foreground" />
		</div>
	);
}

function DeviceSection() {
	const permission = usePushPermission();
	let content: React.ReactNode;
	if (permission.data === "granted") {
		content = (
			<p className="px-4 py-3 text-muted-foreground text-sm">
				Notifications are on for this phone.
			</p>
		);
	} else if (permission.data === "denied") {
		content = (
			<p className="px-4 py-3 text-muted-foreground text-sm">
				Notifications are turned off for Lesefluss in your phone's settings. To turn them on, open
				Settings, then Apps, Lesefluss, Notifications.
			</p>
		);
	} else {
		content = (
			<div className="flex items-center justify-between gap-3 px-4 py-3">
				<p className="text-muted-foreground text-sm">Notifications are off for this phone.</p>
				<Button size="sm" onClick={openPushOffer}>
					Enable notifications
				</Button>
			</div>
		);
	}
	return <SettingsSection title="This phone">{content}</SettingsSection>;
}

function PreferencesSection() {
	const preferences = usePushPreferences();
	const update = useUpdatePushPreferences();

	if (preferences.isPending) return <Spinner />;
	if (preferences.isError) {
		return (
			<OfflineNotice onRetry={() => void preferences.refetch()}>
				Can't reach the server. Notification choices are stored online.
			</OfflineNotice>
		);
	}

	const values = preferences.data;
	const save = (patch: PushPreferencesPatch) =>
		update.mutate(patch, { onError: () => toast.error("Couldn't save. Check your connection.") });

	return (
		<>
			<SettingsSection title="Notify me about">
				<ToggleRow
					title="Friend requests"
					subtitle="New requests, and when someone accepts yours"
					checked={values.friend_requests}
					onCheckedChange={(v) => save({ friend_requests: v })}
				/>
				<ToggleRow
					title="Shared books"
					subtitle="Books shared with you, and when someone adds yours"
					checked={values.shares}
					onCheckedChange={(v) => save({ shares: v })}
				/>
				<ToggleRow
					title="Buddy reads"
					subtitle="Invites, and when friends join or finish"
					checked={values.buddy_reads}
					onCheckedChange={(v) => save({ buddy_reads: v })}
				/>
				<ToggleRow
					title="Discussion"
					subtitle="Replies and reactions to your comments and highlights"
					checked={values.discussion}
					onCheckedChange={(v) => save({ discussion: v })}
				/>
			</SettingsSection>
			<SettingsSection title="Privacy">
				<ToggleRow
					title="Show message previews"
					subtitle={`Up to ${PUSH_PREVIEW_MAX_CHARS} characters of a reply, only for passages you have already read`}
					checked={values.previews}
					onCheckedChange={(v) => save({ previews: v })}
				/>
			</SettingsSection>
			<p className="px-1 text-muted-foreground text-xs">
				These choices apply on every device you are signed in on.
			</p>
		</>
	);
}

function NotificationSettings() {
	const { isLoggedIn, isSessionResolved } = useSyncContext();

	let body: React.ReactNode;
	if (!isSessionResolved) {
		body = <Spinner />;
	} else if (!isLoggedIn) {
		body = (
			<SettingsSection title="Not signed in">
				<p className="px-4 py-3 text-muted-foreground text-sm">
					Sign in under Cloud sync to get notifications from friends.
				</p>
			</SettingsSection>
		);
	} else {
		body = (
			<>
				<DeviceSection />
				<PreferencesSection />
			</>
		);
	}

	return (
		<div className="bg-background">
			<PageHeader title="Notifications" icon={Bell} />
			<div className="mx-auto max-w-2xl px-4 pb-10">{body}</div>
		</div>
	);
}
