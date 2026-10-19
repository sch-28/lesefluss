import { Switch } from "@lesefluss/ui/switch";
import { useEffect, useState } from "react";
import { getReminderPermission, requestReminderPermission } from "../../../services/goal-reminders";
import type { NotificationPermission } from "../../../services/notification-permission";
import { log } from "../../../utils/log";

const DEFAULT_REMINDER_TIME = "20:00";

/**
 * Reminder on/off plus its time. Permission is asked only when the switch goes
 * on. Whenever a reminder is on but this device cannot show it (refused,
 * revoked later in system settings, or a time synced from another device), the
 * row says so and offers to ask again. The caller hides the row where
 * reminders are not supported.
 */
export function GoalReminderRow({
	value,
	onChange,
}: {
	value: string | null;
	onChange: (time: string | null) => void;
}) {
	const [permission, setPermission] = useState<NotificationPermission | null>(null);
	const [wasRefused, setRefused] = useState(false);
	const [lastTime, setLastTime] = useState(value ?? DEFAULT_REMINDER_TIME);

	useEffect(() => {
		let isCurrent = true;
		getReminderPermission()
			.then((p) => {
				if (isCurrent) setPermission(p);
			})
			.catch((err) => log.warn("reminders", "permission check failed:", err));
		return () => {
			isCurrent = false;
		};
	}, []);

	const ask = async (): Promise<boolean> => {
		try {
			const result = await requestReminderPermission();
			setPermission(result);
			setRefused(result !== "granted");
			return result === "granted";
		} catch (err) {
			log.warn("reminders", "permission request failed:", err);
			return false;
		}
	};

	const isOff =
		permission === "prompt" || permission === "denied" ? value !== null || wasRefused : false;

	return (
		<div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-sm">
			<div className="flex min-h-9 items-center gap-3">
				<label htmlFor="goal-reminder" className="flex-1 text-muted-foreground">
					Reminder
				</label>
				{value !== null && (
					<input
						type="time"
						aria-label="Reminder time"
						value={value}
						onChange={(e) => {
							if (!e.target.value) return;
							setLastTime(e.target.value);
							onChange(e.target.value);
						}}
						className="min-h-9 rounded-md border border-input bg-background px-2 text-foreground tabular-nums"
					/>
				)}
				<Switch
					id="goal-reminder"
					checked={value !== null}
					onCheckedChange={async (on) => {
						if (!on) onChange(null);
						else if (await ask()) onChange(lastTime);
					}}
				/>
			</div>
			{isOff && (
				<button
					type="button"
					data-testid="goal-reminder-off"
					onClick={async () => {
						if ((await ask()) && value === null) onChange(lastTime);
					}}
					className="self-start text-left text-[11px] text-muted-foreground underline underline-offset-2"
				>
					{permission === "denied"
						? "notifications blocked · system settings"
						: "notifications off on this device · allow"}
				</button>
			)}
		</div>
	);
}
