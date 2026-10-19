import { inclusiveDays } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	drawerSnapPoints,
} from "@lesefluss/ui/drawer";
import { Slider } from "@lesefluss/ui/slider";
import { cn } from "@lesefluss/ui/utils";
import { ArrowLeftRight, CalendarDays, Lock, LockOpen } from "lucide-react";
import { useState } from "react";
import { queryHooks } from "../../../services/db/hooks";
import type { Book, ReadingGoal } from "../../../services/db/schema";
import { areRemindersSupported } from "../../../services/goal-reminders";
import type { ReadingGoalPlan } from "../../../services/stats/reading-goal";
import { formatDayKey, localDateKey } from "../../../utils/date-utils";
import { log } from "../../../utils/log";
import { minutesLabel, percentLabel } from "../../../utils/reading-time";
import {
	daysToSlider,
	GOAL_PRESETS,
	type GoalSetup,
	goalSpec,
	lockToMode,
	MISSED_DAY_LABEL,
	newGoalSetup,
	presetDays,
	seedFromGoal,
	setupValues,
	sliderToDays,
} from "./goal-model";
import { GoalReminderRow } from "./goal-reminder-row";

const SNAP_POINTS = drawerSnapPoints([1]);

type Props = {
	isOpen: boolean;
	onClose: () => void;
	book: Book;
	wpm: number;
	/** The goal being edited, or null when setting a new one. */
	existing: { goal: ReadingGoal; plan: ReadingGoalPlan } | null;
};

export function GoalSetupSheet({ isOpen, onClose, book, wpm, existing }: Props) {
	const today = existing?.plan.today ?? localDateKey(Date.now());
	const seed = existing ? seedFromGoal(existing.goal, existing.plan) : newGoalSetup(today);
	const [setup, setSetup] = useState<GoalSetup>(seed);
	const [isCustomOpen, setCustomOpen] = useState(false);
	const seedReminder = existing?.goal.reminderTime ?? null;
	const [reminderTime, setReminderTime] = useState<string | null>(seedReminder);
	const [wasOpen, setWasOpen] = useState(isOpen);
	// Reseeded during render when the sheet opens, the same way the annotations sheet resets.
	if (isOpen !== wasOpen) {
		setWasOpen(isOpen);
		if (isOpen) {
			setSetup(seed);
			setCustomOpen(false);
			setReminderTime(seedReminder);
		}
	}

	const create = queryHooks.useCreateReadingGoal();
	const replan = queryHooks.useReplanReadingGoal();
	const setReminder = queryHooks.useSetGoalReminder();
	const remove = queryHooks.useDeleteReadingGoal();
	const isBusy = create.isPending || replan.isPending || setReminder.isPending || remove.isPending;

	const values = setupValues(setup, {
		today,
		wordCount: book.wordCount,
		// A replan restarts from the start of today, so an edit measures from there too.
		wordPosition: existing ? existing.plan.dayStartWord : book.wordPosition,
		wpm,
	});
	const presetMatch = GOAL_PRESETS.find((p) => presetDays(today, p.months) === values.days);
	const isCustom = isCustomOpen || !presetMatch;
	const dateLocked = setup.lock === "date";
	const isUnchanged =
		existing !== null &&
		setup.lock === seed.lock &&
		setup.days === seed.days &&
		setup.dailyPercent === seed.dailyPercent;

	const setDays = (days: number) => setSetup((s) => ({ lock: s.lock, days }));

	const save = async () => {
		const spec = goalSpec(setup.lock, values);
		if (!existing) {
			await create.mutateAsync({ book, spec, reminderTime });
		} else {
			if (!isUnchanged) await replan.mutateAsync({ id: existing.goal.id, change: spec });
			if (reminderTime !== seedReminder) {
				await setReminder.mutateAsync({ id: existing.goal.id, reminderTime });
			}
		}
		onClose();
	};

	return (
		<Drawer
			open={isOpen}
			dismissible={!isBusy}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			snapPoints={SNAP_POINTS}
		>
			<DrawerContent>
				<DrawerHeader className="flex-row items-baseline justify-between gap-3 text-left">
					<DrawerTitle>Reading goal</DrawerTitle>
					<span className="truncate text-muted-foreground text-xs">
						{book.title} · {percentLabel((book.wordPosition / Math.max(1, book.wordCount)) * 100)}%
						read
					</span>
				</DrawerHeader>

				<div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
					<div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
						<ValueCard
							isLocked={!dateLocked}
							onLock={() => setSetup((s) => ({ ...s, lock: "daily" }))}
							value={`${percentLabel(values.dailyPercent)}%`}
							label={`a day · ${minutesLabel(values.minutes)}`}
							lockLabel="Keep daily amount"
						/>
						<ArrowLeftRight className="size-4 text-muted-foreground" aria-hidden />
						<ValueCard
							isLocked={dateLocked}
							onLock={() => setSetup({ lock: "date", days: values.days })}
							value={formatDayKey(values.finishDate)}
							label={`finish · ${values.days} d`}
							lockLabel="Keep finish date"
						/>
					</div>

					<div className="flex flex-col gap-3">
						<span
							id="goal-duration-label"
							className="font-semibold text-muted-foreground text-xs uppercase tracking-wider"
						>
							Duration
						</span>
						<Slider
							min={0}
							max={100}
							step={1}
							value={[daysToSlider(values.days)]}
							onValueChange={(v) => {
								setDays(sliderToDays(v[0] ?? 0));
								setCustomOpen(false);
							}}
							className="py-3"
							thumbProps={{
								"aria-labelledby": "goal-duration-label",
								"aria-valuetext": `${values.days} days, finish ${formatDayKey(values.finishDate)}`,
							}}
						/>
						<div className="flex justify-between text-[11px] text-muted-foreground">
							<span>1 week</span>
							<span>1 month</span>
							<span>3 months</span>
							<span>1 year</span>
						</div>
					</div>

					<div className="flex flex-wrap gap-2">
						{GOAL_PRESETS.map((p) => {
							const isOn = !isCustom && presetMatch === p;
							return (
								<Chip
									key={p.label}
									isOn={isOn}
									aria-pressed={isOn}
									onClick={() => {
										setDays(presetDays(today, p.months));
										setCustomOpen(false);
									}}
								>
									{p.label}
								</Chip>
							);
						})}
						<Chip
							isOn={isCustom}
							aria-expanded={isCustomOpen}
							onClick={() => setCustomOpen((open) => !open)}
						>
							<CalendarDays className="size-3.5" aria-hidden />
							{isCustom ? formatDayKey(values.finishDate) : "Custom date"}
						</Chip>
					</div>

					{isCustomOpen && (
						<label className="flex flex-col gap-1 text-muted-foreground text-xs">
							Finish on
							<input
								type="date"
								min={today}
								value={values.finishDate}
								onChange={(e) => {
									if (!e.target.value) return;
									const next = inclusiveDays(today, e.target.value);
									if (next >= 1) setDays(next);
								}}
								className="min-h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
							/>
						</label>
					)}

					<div className="flex gap-3 rounded-lg border border-border bg-muted/40 px-3.5 py-3 text-sm">
						<span className="text-muted-foreground">Missed day</span>
						<span className="font-semibold">{MISSED_DAY_LABEL[lockToMode(setup.lock)]}</span>
					</div>

					{areRemindersSupported() && (
						<GoalReminderRow value={reminderTime} onChange={setReminderTime} />
					)}

					<Button
						size="lg"
						onClick={() => save().catch((err) => log.warn("goals", "saving the goal failed:", err))}
						disabled={isBusy || book.wordCount <= 0}
					>
						{existing ? "Save goal" : "Start goal"}
					</Button>
					{existing && (
						<Button
							variant="ghost"
							className="text-destructive"
							disabled={isBusy}
							onClick={() => remove.mutate({ id: existing.goal.id }, { onSuccess: onClose })}
						>
							Remove goal
						</Button>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	);
}

function ValueCard({
	isLocked,
	onLock,
	value,
	label,
	lockLabel,
}: {
	isLocked: boolean;
	onLock: () => void;
	value: string;
	label: string;
	lockLabel: string;
}) {
	const LockIcon = isLocked ? Lock : LockOpen;
	return (
		<button
			type="button"
			onClick={onLock}
			aria-pressed={isLocked}
			aria-label={`${value}, ${label}. ${lockLabel}`}
			className={cn(
				"rounded-lg bg-muted/40 px-2.5 py-2 text-left",
				isLocked ? "border-2 border-foreground" : "border border-border",
			)}
		>
			<span className="flex items-center justify-between gap-2">
				<span className="font-bold text-[22px] tabular-nums leading-none">{value}</span>
				<LockIcon
					className={cn(
						"size-3.5 shrink-0",
						isLocked ? "text-foreground" : "text-muted-foreground",
					)}
					aria-hidden
				/>
			</span>
			<span className="mt-1 block text-[10px] text-muted-foreground uppercase tracking-wider">
				{label}
			</span>
		</button>
	);
}

function Chip({ isOn, children, ...props }: React.ComponentProps<"button"> & { isOn: boolean }) {
	return (
		<button
			type="button"
			className={cn(
				"inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm",
				isOn ? "border-foreground bg-foreground text-background" : "border-input",
			)}
			{...props}
		>
			{children}
		</button>
	);
}
