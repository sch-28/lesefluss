import { App as CapacitorApp } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useLocalDayNow } from "../../hooks/use-local-day";
import { log } from "../../utils/log";
import { bookKeys, statsKeys } from "../db/hooks/query-keys";
import { queries } from "../db/queries";
import { markNotificationTapReceived, markReminderListenersAttached } from "../launch-intent";
import {
	areRemindersSupported,
	loadReminderPluginModule,
	requestReminderSync,
	syncGoalReminders,
} from "./index";
import { reminderBookId } from "./schedule";

const PLAN_QUERY_ROOTS = new Set<unknown>([statsKeys.all[0], bookKeys.all[0]]);

/**
 * Keeps goal reminders in step with the plans, mounted at the root: on start,
 * on resume and when the local day rolls over. The explicit triggers (session
 * flush, sync pull, goal edits) call `requestReminderSync` themselves; watching
 * plan-bearing query invalidations is a fallback for anything else. Also opens
 * the reader for a tapped reminder.
 */
export function useGoalReminders(): void {
	const router = useRouter();
	const queryClient = useQueryClient();
	const day = useLocalDayNow();

	useEffect(() => {
		void syncGoalReminders(day);
	}, [day]);

	useEffect(() => {
		if (!areRemindersSupported()) return;
		const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
			if (event.type !== "updated" || event.action.type !== "invalidate") return;
			if (PLAN_QUERY_ROOTS.has(event.query.queryKey[0])) requestReminderSync();
		});
		const resume = CapacitorApp.addListener("resume", requestReminderSync);
		return () => {
			unsubscribe();
			void resume.then((h) => h.remove());
		};
	}, [queryClient]);

	useEffect(() => {
		if (!areRemindersSupported()) {
			markReminderListenersAttached();
			return;
		}
		let isCancelled = false;
		let handle: PluginListenerHandle | null = null;
		(async () => {
			const { LocalNotifications } = await loadReminderPluginModule();
			const added = await LocalNotifications.addListener(
				"localNotificationActionPerformed",
				({ notification }) => {
					const bookId = reminderBookId(notification.extra);
					if (!bookId) return;
					markNotificationTapReceived();
					void openReminderTarget(bookId);
				},
			);
			if (isCancelled) void added.remove();
			else handle = added;
		})()
			.catch((err) => log.warn("reminders", "tap listener setup failed:", err))
			.finally(markReminderListenersAttached);

		async function openReminderTarget(bookId: string) {
			const book = await queries.getBook(bookId).catch(() => undefined);
			if (book && !book.deleted) {
				await router.navigate({ to: "/tabs/reader/$id", params: { id: bookId } });
			} else {
				await router.navigate({ to: "/tabs/library" });
			}
		}

		return () => {
			isCancelled = true;
			void handle?.remove();
		};
	}, [router]);
}
