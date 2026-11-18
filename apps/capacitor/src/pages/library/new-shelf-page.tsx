import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@lesefluss/ui/alert-dialog";
import { useBlocker, useRouter } from "@tanstack/react-router";
import type React from "react";
import { useMemo, useRef } from "react";
import { CARD } from "@/components/card";
import { BookEditLayout, useIsWideLayout } from "./book-edit-layout";
import { filterToTree } from "./condition-tree";
import { decodeFilterParam } from "./filter-model";
import { useShelfEditor } from "./shelf-condition-editor";

/** New smart shelf as a page, like New collection and New series. Editing a shelf stays a dialog. */
const NewShelfPage: React.FC<{ filterParam?: string }> = ({ filterParam }) => {
	const router = useRouter();
	const isWide = useIsWideLayout();
	const initialTree = useMemo(() => {
		const filter = decodeFilterParam(filterParam);
		return filter ? filterToTree(filter) : undefined;
	}, [filterParam]);
	const leave = () => {
		if (router.history.canGoBack()) router.history.back();
		else void router.navigate({ to: "/tabs/library", search: {}, replace: true });
	};
	// A ref, not state: the save navigates in the same tick, before a re-render
	// could tell the blocker the shelf is stored.
	const isLeavingRef = useRef(false);
	const editor = useShelfEditor({
		shelf: null,
		initialTree,
		isStacked: !isWide,
		onDone: () => {
			isLeavingRef.current = true;
		},
		replaceOnSave: true,
	});
	const blocker = useBlocker({
		shouldBlockFn: () => editor.isDirty && !isLeavingRef.current,
		enableBeforeUnload: () => editor.isDirty && !isLeavingRef.current,
		withResolver: true,
	});

	return (
		<BookEditLayout
			title="New smart shelf"
			status={
				<span data-testid="shelf-live-count" aria-live="polite">
					{editor.countLabel}
				</span>
			}
			cancelLabel="Cancel"
			saveLabel="Create shelf"
			onCancel={leave}
			onSave={editor.save}
			canSave={editor.canSave}
			isSaving={editor.isPending}
			isBusy={editor.isPending}
		>
			<div className="flex flex-col gap-3" onKeyDown={editor.keyboard}>
				<p className="m-0 text-muted-foreground text-sm">
					Books matching these conditions appear on the shelf.
				</p>
				<div className={CARD}>{editor.body}</div>
				{editor.hint && <p className="m-0 text-muted-foreground text-xs">{editor.hint}</p>}
			</div>

			<AlertDialog
				open={blocker.status === "blocked"}
				onOpenChange={(open) => {
					if (!open) blocker.reset?.();
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Discard changes?</AlertDialogTitle>
						<AlertDialogDescription>The shelf isn't created yet.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep editing</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								isLeavingRef.current = true;
								blocker.proceed?.();
							}}
						>
							Discard
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</BookEditLayout>
	);
};

export default NewShelfPage;
