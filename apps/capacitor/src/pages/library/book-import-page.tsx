import { Button } from "@lesefluss/ui/button";
import { useOverlayBack } from "@lesefluss/ui/overlay-back";
import { useBlocker, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";
import { type ImportQueue, useImportQueue } from "../../contexts/import-staging-context";
import { BookEditFields } from "./book-edit-fields";
import { finalizeEditValues } from "./book-edit-form";
import { BookEditLayout, useEditForm, useIsWideLayout } from "./book-edit-layout";

/**
 * The import confirm: the edit page for a book that has no row yet. Leaves on
 * its own once the queue is empty, so a deep link to it with nothing staged
 * lands in the library.
 */
const BookImportPage: React.FC = () => {
	const queue = useImportQueue();
	const router = useRouter();
	const latest = useRef(queue);
	latest.current = queue;
	const isLeavingRef = useRef(false);
	const hasNavigatedAwayRef = useRef(false);
	const isEmpty = queue.current === null;

	useEffect(() => {
		isLeavingRef.current = isEmpty;
		if (!isEmpty || hasNavigatedAwayRef.current) return;
		if (router.history.canGoBack()) {
			router.history.back();
		} else {
			void router.navigate({ to: "/tabs/library", replace: true });
		}
	}, [isEmpty, router]);

	// Android back cancels this import, like the ✕, and the next one comes up.
	useOverlayBack(!isEmpty, queue.discard, !queue.isBusy);

	// Leaving any other way (a tab, a link) drops what is still staged: the
	// files are cache copies the reader would have no way back to.
	useBlocker({
		shouldBlockFn: () => {
			const q = latest.current;
			if (isLeavingRef.current || !q.current) return false;
			if (q.isBusy) return true;
			// The emptied queue must not also send the reader back from where they went.
			hasNavigatedAwayRef.current = true;
			q.discardAll();
			return false;
		},
	});

	if (!queue.current || !queue.initial) return null;
	return <ImportForm key={queue.position} queue={queue} initial={queue.initial} />;
};

const ImportForm: React.FC<{
	queue: ImportQueue;
	initial: NonNullable<ImportQueue["initial"]>;
}> = ({ queue, initial }) => {
	const isWide = useIsWideLayout();
	const form = useEditForm(initial);
	const staged = queue.current;
	if (!staged) return null;
	const { payload, extras } = staged;

	return (
		<BookEditLayout
			title="Add book"
			closeIcon="close"
			status={queue.total > 1 ? `${queue.position} of ${queue.total}` : null}
			cancelLabel="Cancel import"
			saveLabel="Add to library"
			onCancel={queue.discard}
			onSave={() => {
				const values = finalizeEditValues(form.values, form.tagDraft);
				if (values.title) queue.commit(values);
			}}
			canSave={form.values.title.trim().length > 0 && !queue.isCheckingAttach}
			isSaving={queue.isCommitting}
			isBusy={queue.isBusy}
		>
			<div
				className="flex flex-col gap-4"
				data-alternative-state={
					queue.isCheckingAttach ? "checking" : queue.attachCandidate ? "offered" : "none"
				}
			>
				{queue.isCheckingAttach && (
					<p className="m-0 text-muted-foreground text-sm">Checking your library…</p>
				)}
				{queue.attachHint && (
					<div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
						<div className="min-w-0 flex-1">
							<p className="m-0 font-medium text-sm">Already in your library?</p>
							<p className="m-0 text-muted-foreground text-sm">{queue.attachHint}</p>
						</div>
						<Button variant="secondary" disabled={queue.isBusy} onClick={queue.attach}>
							{queue.isAttaching && <Loader2 className="size-4 animate-spin" />}
							Attach
						</Button>
					</div>
				)}
				<BookEditFields
					form={form}
					isWide={isWide}
					cover={payload.coverImage ?? null}
					format={payload.fileFormat}
					facts={["New"]}
					fileLanguage={extras.language ?? payload.language ?? null}
				/>
			</div>
		</BookEditLayout>
	);
};

export default BookImportPage;
