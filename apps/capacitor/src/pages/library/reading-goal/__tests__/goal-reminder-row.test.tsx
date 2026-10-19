import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toNotificationPermission } from "../../../../services/notification-permission";
import { type Rendered, render } from "../../../../test/render";

const permission = { current: "prompt", afterRequest: "granted" };
const requestReminderPermission = vi.fn(async () => {
	permission.current = permission.afterRequest;
	return permission.current;
});
vi.mock("../../../../services/goal-reminders", () => ({
	getReminderPermission: async () => permission.current,
	requestReminderPermission,
}));

const { GoalReminderRow } = await import("../goal-reminder-row");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	permission.current = "prompt";
	permission.afterRequest = "granted";
	vi.clearAllMocks();
});

async function click(v: Rendered, selector: string) {
	await act(async () => {
		v.container.querySelector<HTMLButtonElement>(selector)?.click();
	});
}

const hint = (v: Rendered) => v.container.querySelector('[data-testid="goal-reminder-off"]');

describe("GoalReminderRow", () => {
	it("is off by default and asks for permission only when switched on", async () => {
		const onChange = vi.fn();
		view = await render(<GoalReminderRow value={null} onChange={onChange} />);
		expect(view.container.querySelector('input[type="time"]')).toBeNull();
		expect(hint(view)).toBeNull();
		expect(requestReminderPermission).not.toHaveBeenCalled();

		await click(view, "#goal-reminder");
		expect(requestReminderPermission).toHaveBeenCalledOnce();
		expect(onChange).toHaveBeenCalledWith("20:00");
	});

	it("stays off after a refusal, says so, and the hint asks again", async () => {
		permission.afterRequest = "prompt";
		const onChange = vi.fn();
		view = await render(<GoalReminderRow value={null} onChange={onChange} />);
		await click(view, "#goal-reminder");
		expect(onChange).not.toHaveBeenCalled();
		expect(hint(view)?.textContent).toBe("notifications off on this device · allow");

		permission.afterRequest = "granted";
		await click(view, '[data-testid="goal-reminder-off"]');
		expect(onChange).toHaveBeenCalledWith("20:00");
	});

	it("says blocked after a permanent refusal", async () => {
		permission.afterRequest = "denied";
		view = await render(<GoalReminderRow value={null} onChange={vi.fn()} />);
		await click(view, "#goal-reminder");
		expect(hint(view)?.textContent).toBe("notifications blocked · system settings");
	});

	it("flags a reminder synced from another device on a device that never asked", async () => {
		view = await render(<GoalReminderRow value="07:30" onChange={vi.fn()} />);
		expect(hint(view)?.textContent).toBe("notifications off on this device · allow");
		await click(view, '[data-testid="goal-reminder-off"]');
		expect(requestReminderPermission).toHaveBeenCalledOnce();
		expect(hint(view)).toBeNull();
	});

	it("flags a reminder whose permission was revoked after it was granted", async () => {
		permission.current = "denied";
		view = await render(<GoalReminderRow value="07:30" onChange={vi.fn()} />);
		expect(hint(view)?.textContent).toBe("notifications blocked · system settings");
	});

	it("shows the chosen time and switches off without asking", async () => {
		permission.current = "granted";
		const onChange = vi.fn();
		view = await render(<GoalReminderRow value="07:30" onChange={onChange} />);
		expect(hint(view)).toBeNull();
		expect(view.container.querySelector<HTMLInputElement>('input[type="time"]')?.value).toBe(
			"07:30",
		);
		await click(view, "#goal-reminder");
		expect(onChange).toHaveBeenCalledWith(null);
		expect(requestReminderPermission).not.toHaveBeenCalled();
	});
});

describe("toNotificationPermission", () => {
	it("treats Android's after-first-refusal state as askable", () => {
		expect(toNotificationPermission("prompt-with-rationale")).toBe("prompt");
		expect(toNotificationPermission("denied")).toBe("denied");
		expect(toNotificationPermission("granted")).toBe("granted");
	});
});
