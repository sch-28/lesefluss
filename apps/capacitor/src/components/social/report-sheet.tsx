import {
	NOTICE_REASON_LABELS,
	NOTICE_REASONS,
	NOTICE_TEXT_MAX_LENGTH,
	NOTICE_TEXT_MIN_LENGTH,
	type NoticeReason,
	type NoticeTargetType,
} from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import { Label } from "@lesefluss/ui/label";
import { Switch } from "@lesefluss/ui/switch";
import { useEffect, useState } from "react";
import { toast } from "@/components/toast";
import { AuthedFetchError } from "@/services/authed-fetch";
import { socialErrorMessage } from "@/services/social/friends";
import { useReportUser } from "@/services/social/report";

export type ReportTarget = {
	type: NoticeTargetType;
	userId: string;
	/** The person's display name, for the title. */
	name: string;
	/** For `shared_book`: the id of the share that was received. */
	subjectId?: string;
	/** Hide "Also block" when it makes no sense (already blocked). */
	canBlock?: boolean;
};

const textareaClass =
	"w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

function errorMessage(err: unknown): string {
	if (err instanceof AuthedFetchError && err.status === 400) {
		return "We couldn't take this report. Check the text (at least 10 characters) and that it is about someone else.";
	}
	if (err instanceof AuthedFetchError) return socialErrorMessage(err);
	return "You seem to be offline. Your text is kept; try again when you're back online.";
}

/**
 * The one report flow. Later entry points (a received share, a comment) pass a
 * different target; the reasons, text and block option stay the same.
 */
export function ReportSheet({
	target,
	onClose,
}: {
	target: ReportTarget | null;
	onClose: () => void;
}) {
	const report = useReportUser();
	const [reason, setReason] = useState<NoticeReason>("harassment");
	const [text, setText] = useState("");
	const [block, setBlock] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isOpen = target !== null;
	const canSubmit = text.trim().length >= NOTICE_TEXT_MIN_LENGTH && !report.isPending;

	const reset = () => {
		setReason("harassment");
		setText("");
		setBlock(false);
		setError(null);
	};
	// A draft belongs to one person; a new target starts clean.
	const targetKey = target ? `${target.type}:${target.userId}:${target.subjectId ?? ""}` : null;
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the target changes
	useEffect(() => {
		if (targetKey) reset();
	}, [targetKey]);

	const submit = () => {
		if (!target) return;
		setError(null);
		report.mutate(
			{
				targetType: target.type,
				targetUserId: target.userId,
				subjectId: target.subjectId,
				reason,
				text: text.trim(),
				block,
			},
			{
				onSuccess: () => {
					toast.success(
						block ? "Report sent. This person is blocked." : "Report sent. We'll review it.",
					);
					reset();
					onClose();
				},
				onError: (err) => setError(errorMessage(err)),
			},
		);
	};

	return (
		<Drawer
			open={isOpen}
			dismissible={!report.isPending}
			onOpenChange={(open) => {
				if (!open) {
					reset();
					onClose();
				}
			}}
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Report {target?.name ?? ""}</DrawerTitle>
				</DrawerHeader>
				<div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-4 pb-2">
					<fieldset className="flex flex-col gap-1.5">
						<legend className="mb-1.5 text-sm">What's wrong?</legend>
						{NOTICE_REASONS.map((r) => (
							<label key={r} className="flex items-center gap-3 py-1 text-sm">
								<input
									type="radio"
									name="report-reason"
									value={r}
									checked={reason === r}
									onChange={() => setReason(r)}
									disabled={report.isPending}
								/>
								{NOTICE_REASON_LABELS[r]}
							</label>
						))}
					</fieldset>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="report-text">
							Tell us more{" "}
							<span className="text-muted-foreground text-xs">
								({text.length}/{NOTICE_TEXT_MAX_LENGTH})
							</span>
						</Label>
						<textarea
							id="report-text"
							value={text}
							onChange={(e) => setText(e.target.value.slice(0, NOTICE_TEXT_MAX_LENGTH))}
							rows={4}
							disabled={report.isPending}
							placeholder="What happened, and where."
							className={textareaClass}
						/>
					</div>
					{target?.canBlock !== false && (
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<Label htmlFor="report-block">Also block {target?.name}</Label>
								<p className="m-0 text-muted-foreground text-xs">
									Ends any friendship and stops further contact. They are not notified.
								</p>
							</div>
							<Switch
								id="report-block"
								checked={block}
								onCheckedChange={setBlock}
								disabled={report.isPending}
							/>
						</div>
					)}
					<p className="m-0 text-muted-foreground text-xs">
						We review every report. The person is never told who reported them. You'll find our
						decision in your inbox.
					</p>
					{error && (
						<p className="m-0 text-destructive text-sm" role="alert">
							{error}
						</p>
					)}
				</div>
				<DrawerFooter className="flex-row gap-2">
					<Button
						variant="outline"
						className="flex-1"
						disabled={report.isPending}
						onClick={() => {
							reset();
							onClose();
						}}
					>
						Cancel
					</Button>
					<Button className="flex-1" disabled={!canSubmit} onClick={submit}>
						{report.isPending ? "Sending…" : "Send report"}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
