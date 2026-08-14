/**
 * BatchImportSheet
 *
 * Fullscreen flow for importing a folder of books: scan, review what was found,
 * import the selection. Owns no IO of its own; `useFolderImport` holds the
 * state machine and `library/index.tsx` only controls whether it is open.
 */

import { Button } from "@lesefluss/ui/button";
import { Progress } from "@lesefluss/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@lesefluss/ui/sheet";
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, X } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { pushBackHandler } from "../../../services/overlay-back";
import { useWakeLock } from "../../reader/use-wake-lock";
import CandidateCard from "./candidate-card";
import { candidateKey } from "./candidates";
import { useFolderImport } from "./use-folder-import";

type Props = {
	isOpen: boolean;
	existingTitles: ReadonlySet<string>;
	onClose: () => void;
};

const BatchImportSheet: React.FC<Props> = ({ isOpen, existingTitles, onClose }) => {
	const folder = useFolderImport(existingTitles, onClose);
	const { phase, start } = folder;

	// The picker opens as soon as the sheet does: a scan is the only thing this
	// flow can do first, so an intermediate "choose a folder" screen is a step
	// with one option.
	useEffect(() => {
		if (isOpen && phase === "idle") start();
	}, [isOpen, phase, start]);

	// Screen must not sleep mid-run: a batch of forty books takes minutes and
	// needs no touches.
	useWakeLock(phase === "importing", "batch-import");

	// Back closes the sheet rather than navigating the library behind it, the
	// same contract the import confirm sheet uses. A run in progress ignores it.
	useEffect(() => {
		if (!isOpen) return;
		return pushBackHandler(() => {
			if (phase === "importing") return true;
			folder.close();
			return true;
		});
	}, [isOpen, phase, folder.close]);

	const isBusy = phase === "importing";

	return (
		<Sheet
			open={isOpen}
			onOpenChange={(open) => {
				if (!open && !isBusy) folder.close();
			}}
		>
			{/* Fills the screen, insets applied as padding rather than by shrinking:
			    sizing it smaller would leave the overlay showing above the sheet.
			    `pt-` is added here because only `side="top"` carries a top inset, a
			    bottom sheet not being expected to reach the status bar. No `p-0`,
			    which tailwind-merge would let supersede the built-in bottom inset.
			    The handle and the built-in close button are dropped: nothing here is
			    draggable, and an absolutely-positioned close would sit under the
			    status bar. The header carries its own. */}
			<SheetContent
				side="bottom"
				showHandle={false}
				showCloseButton={false}
				className="flex h-[100dvh] flex-col gap-0 rounded-none pt-[env(safe-area-inset-top)]"
			>
				<SheetHeader className="border-border border-b">
					<div className="flex items-center justify-between">
						<SheetTitle>
							{phase === "scanning" && "Scanning folder…"}
							{phase === "review" && `${folder.candidates.length} books found`}
							{phase === "importing" && "Importing…"}
							{phase === "done" && "Import finished"}
							{phase === "idle" && "Import folder"}
						</SheetTitle>
						{/* Hidden mid-run: leaving would strand a partially written batch. */}
						{!isBusy && (
							<button
								type="button"
								onClick={folder.close}
								aria-label="Close"
								className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
							>
								<X className="size-4" />
							</button>
						)}
					</div>
					{/* Always rendered during review, swapping text rather than appearing:
					    a status line that mounts and unmounts shifts the whole grid under
					    it every time probing finishes. */}
					{phase === "review" && (
						<p className="m-0 flex items-center gap-1.5 text-muted-foreground text-xs">
							{folder.pendingProbes > 0 ? (
								<>
									<Loader2 className="size-3 animate-spin" />
									Reading details… {folder.pendingProbes} left
								</>
							) : (
								`${folder.selectedCount} of ${folder.candidates.length} selected`
							)}
						</p>
					)}
				</SheetHeader>

				{phase === "scanning" && (
					<div className="flex flex-1 items-center justify-center text-muted-foreground">
						<Loader2 className="mr-2 size-5 animate-spin" />
						Looking for books…
					</div>
				)}

				{phase === "review" && (
					<>
						<div className="flex flex-wrap items-center gap-2 border-border border-b px-4 py-3">
							{folder.formats.map((entry) => {
								const allOn = entry.selected === entry.total;
								return (
									<button
										key={entry.format}
										type="button"
										onClick={() => folder.selectAll(!allOn, entry.format)}
										className={`rounded-full border px-3 py-1 font-medium text-xs uppercase ${
											allOn
												? "border-primary bg-primary text-primary-foreground"
												: "border-border text-muted-foreground"
										}`}
									>
										{entry.format} {entry.selected}/{entry.total}
									</button>
								);
							})}
							<div className="ml-auto flex gap-2">
								<Button variant="ghost" size="sm" onClick={() => folder.selectAll(true)}>
									All
								</Button>
								<Button variant="ghost" size="sm" onClick={() => folder.selectAll(false)}>
									None
								</Button>
							</div>
						</div>

						{folder.truncated && (
							<div className="flex items-center gap-2 border-border border-b bg-muted/50 px-4 py-2 text-muted-foreground text-xs">
								<AlertTriangle className="size-4 shrink-0" />
								This folder holds more files than one scan covers. Import these, then scan the rest.
							</div>
						)}

						{/* `content-start` because `flex-1` makes this taller than its rows
						    until the grid fills up, and a grid's default `align-content`
						    stretches rows to fill that slack. */}
						<div className="grid flex-1 auto-rows-min grid-cols-3 content-start gap-3 overflow-y-auto p-4">
							{folder.candidates.map((candidate) => {
								const key = candidateKey(candidate);
								return (
									<CandidateCard
										key={key}
										candidate={candidate}
										isDuplicate={folder.duplicateKeys.has(key)}
										onToggle={() => folder.toggle(key)}
									/>
								);
							})}
						</div>

						<div className="border-border border-t p-4">
							<Button
								className="w-full"
								disabled={folder.selectedCount === 0}
								onClick={folder.beginImport}
							>
								{folder.selectedCount === 0
									? "Nothing selected"
									: `Import ${folder.selectedCount} ${folder.selectedCount === 1 ? "book" : "books"}`}
							</Button>
						</div>
					</>
				)}

				{phase === "importing" && (
					<div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
						<Progress
							value={
								folder.progress.total > 0 ? (folder.progress.done / folder.progress.total) * 100 : 0
							}
							className="w-full"
						/>
						<div className="text-center">
							<div className="font-medium tabular-nums">
								{folder.progress.done} / {folder.progress.total}
							</div>
							<div className="mt-1 truncate text-muted-foreground text-sm">
								{folder.progress.current}
							</div>
						</div>
						<Button variant="outline" onClick={folder.cancelImport}>
							Stop after this book
						</Button>
					</div>
				)}

				{phase === "done" && folder.result && (
					<>
						<div className="flex flex-1 flex-col overflow-y-auto">
							<div className="flex flex-col items-center gap-3 px-6 pt-10 pb-6 text-center">
								<span
									className={`flex size-14 items-center justify-center rounded-full ${
										folder.result.imported > 0
											? "bg-primary/10 text-primary"
											: "bg-muted text-muted-foreground"
									}`}
								>
									{folder.result.cancelled ? (
										<CircleSlash className="size-7" />
									) : folder.result.failures.length > 0 ? (
										<AlertTriangle className="size-7" />
									) : (
										<CheckCircle2 className="size-7" />
									)}
								</span>
								<div>
									<p className="m-0 font-semibold text-lg">
										{folder.result.imported === 0
											? "No books added"
											: `Added ${folder.result.imported} ${folder.result.imported === 1 ? "book" : "books"}`}
									</p>
									<p className="m-0 mt-1 text-muted-foreground text-sm">
										{folder.result.cancelled
											? "Stopped after the book that was in progress."
											: folder.result.failures.length > 0
												? "The rest of the batch finished."
												: "They're in your library now."}
									</p>
								</div>
							</div>

							{folder.result.failures.length > 0 && (
								<div className="px-6 pb-6">
									<div className="overflow-hidden rounded-lg border border-border">
										<p className="m-0 border-border border-b bg-muted/50 px-3 py-2 font-medium text-muted-foreground text-xs">
											{folder.result.failures.length}{" "}
											{folder.result.failures.length === 1 ? "file" : "files"} couldn't be imported
										</p>
										<ul className="m-0 list-none divide-y divide-border p-0">
											{folder.result.failures.map((failure) => (
												<li key={failure.file.id} className="px-3 py-2">
													<div className="truncate font-medium text-sm">{failure.file.name}</div>
													<div className="text-muted-foreground text-xs">{failure.reason}</div>
												</li>
											))}
										</ul>
									</div>
								</div>
							)}
						</div>
						<div className="border-border border-t p-4">
							<Button className="w-full" onClick={folder.close}>
								Done
							</Button>
						</div>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
};

export default BatchImportSheet;
