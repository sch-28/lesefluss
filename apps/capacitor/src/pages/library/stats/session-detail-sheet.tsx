import { isMeasurableSitting, READING_MODES, type ReadingMode, wpmFrom } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { useId, useState } from "react";
import { EntryDialog } from "../../../components/entry-dialog";
import { queryHooks } from "../../../services/db/hooks";
import type { Book, ReadingSession } from "../../../services/db/schema";
import { formatDuration } from "../../../utils/date-utils";
import { formatClock, formatPercent, MODE_BADGE_LABELS } from "./session-list";

const MAX_EDIT_MINUTES = 24 * 60;

export function sessionSpeedText(session: ReadingSession, isSkimmed: boolean): string {
	if (isSkimmed) return "Skimmed, not counted for speed";
	const wpm = isMeasurableSitting(session) ? wpmFrom(session.wordsRead, session.durationMs) : null;
	return wpm !== null ? `${wpm} wpm` : "Not measured";
}

/** Whole minutes in 1..24h, or null for anything else. */
export function parseEditMinutes(text: string): number | null {
	if (!/^\d+$/.test(text.trim())) return null;
	const minutes = Number(text);
	return minutes >= 1 && minutes <= MAX_EDIT_MINUTES ? minutes : null;
}

type Props = {
	session: ReadingSession | null;
	book: Book | null;
	isSkimmed: boolean;
	onClose: () => void;
	onDelete: (session: ReadingSession) => void;
};

export function SessionDetailSheet({ session, book, isSkimmed, onClose, onDelete }: Props) {
	return (
		<EntryDialog
			open={session !== null}
			onOpenChange={(open) => !open && onClose()}
			title={book?.title ?? "Session"}
		>
			{session && (
				<SessionDetailForm
					key={session.id}
					session={session}
					book={book}
					isSkimmed={isSkimmed}
					onClose={onClose}
					onDelete={onDelete}
				/>
			)}
		</EntryDialog>
	);
}

function SessionDetailForm({
	session,
	book,
	isSkimmed,
	onClose,
	onDelete,
}: Omit<Props, "session"> & { session: ReadingSession }) {
	const update = queryHooks.useUpdateReadingSession();
	const durationId = useId();
	const [minutesText, setMinutesText] = useState(
		String(Math.max(1, Math.round(session.durationMs / 60_000))),
	);
	const [mode, setMode] = useState<ReadingMode>(session.mode);
	const minutes = parseEditMinutes(minutesText);
	const durationMs = minutes === null ? null : minutes * 60_000;
	const durationChanged =
		durationMs !== null && Math.round(session.durationMs / 60_000) * 60_000 !== durationMs;
	const isDirty = durationChanged || mode !== session.mode;

	const wordCount = book?.wordCount ?? 0;
	const range =
		wordCount > 0
			? `${formatPercent((session.startWord / wordCount) * 100)} → ${formatPercent((session.endWord / wordCount) * 100)}`
			: null;
	const date = new Date(session.startedAt).toLocaleDateString(undefined, {
		weekday: "short",
		day: "numeric",
		month: "short",
	});

	function save() {
		if (durationMs === null) return;
		update.mutate(
			{ id: session.id, edit: { ...(durationChanged ? { durationMs } : {}), mode } },
			{ onSuccess: onClose },
		);
	}

	return (
		<>
			<dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
				<Fact label="Time" value={`${date}, ${formatClock(session.startedAt)}`} />
				<Fact label="Duration" value={formatDuration(session.durationMs)} />
				<Fact label="Words" value={session.wordsRead.toLocaleString()} />
				<Fact label="Speed" value={sessionSpeedText(session, isSkimmed)} />
				{range && <Fact label="Position" value={range} />}
			</dl>

			<div className="flex flex-col gap-1 text-sm">
				<label htmlFor={durationId} className="font-medium">
					Duration (minutes)
				</label>
				<Input
					id={durationId}
					inputMode="numeric"
					value={minutesText}
					onChange={(e) => setMinutesText(e.target.value)}
					aria-invalid={minutes === null}
				/>
			</div>

			<fieldset className="m-0 flex flex-col gap-1 border-0 p-0 text-sm">
				<legend className="mb-1 font-medium">Mode</legend>
				<div className="flex flex-wrap gap-1.5">
					{READING_MODES.map((m) => (
						<Button
							key={m}
							type="button"
							size="sm"
							variant={m === mode ? "default" : "outline"}
							aria-pressed={m === mode}
							onClick={() => setMode(m)}
						>
							{MODE_BADGE_LABELS[m]}
						</Button>
					))}
				</div>
			</fieldset>

			<div className="flex gap-2 pt-1">
				<Button
					variant="ghost"
					className="text-destructive hover:text-destructive"
					onClick={() => {
						onClose();
						onDelete(session);
					}}
				>
					Delete
				</Button>
				<Button
					className="ml-auto"
					disabled={!isDirty || durationMs === null || update.isPending}
					onClick={save}
				>
					Save
				</Button>
			</div>
		</>
	);
}

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="m-0 truncate tabular-nums">{value}</dd>
		</div>
	);
}
