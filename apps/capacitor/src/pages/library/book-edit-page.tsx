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
import { useOverlayBack } from "@lesefluss/ui/overlay-back";
import { useQuery } from "@tanstack/react-query";
import { useBlocker, useRouter } from "@tanstack/react-router";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { getCatalogBook, getCoverUrl } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import { queryHooks } from "../../services/db/hooks";
import type { Book } from "../../services/db/schema";
import { formatShortDate } from "../../utils/date-utils";
import { BookEditFields } from "./book-edit-fields";
import {
	type BookEditValues,
	bookToEditValues,
	editValuesToPatch,
	finalizeEditValues,
	isEditDirty,
	isSeriesDirty,
	planSeriesChange,
	type SeriesChoice,
	type SeriesMembership,
	seriesChoiceOf,
} from "./book-edit-form";
import { BookEditLayout, UnsavedMark, useEditForm, useIsWideLayout } from "./book-edit-layout";
import { SeriesField } from "./series-field";

type Props = {
	id: string;
};

const noop = () => {};

function plainText(html: string): string {
	return new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ?? "";
}

export function wordCountFact(words: number): string | null {
	if (words <= 0) return null;
	return words >= 1000 ? `${Math.round(words / 1000)}k words` : `${words} words`;
}

const BookEditPage: React.FC<Props> = ({ id }) => {
	const { data: book, isPending } = queryHooks.useBook(id);
	const membership = queryHooks.useSeriesMembershipForBook(id);

	if (isPending || membership.isPending) {
		return <p className="p-6 text-center text-muted-foreground text-sm">Loading…</p>;
	}
	if (!book) {
		return <p className="p-6 text-center text-muted-foreground text-sm">Book not found.</p>;
	}
	return (
		<EditBookForm
			// Seeded once per book: a sync pull refreshing the row mid-edit must not
			// throw away what the reader typed.
			key={book.id}
			book={book}
			membership={membership.data ?? null}
		/>
	);
};

const EditBookForm: React.FC<{
	book: Book;
	membership: SeriesMembership | null;
}> = ({ book, membership }) => {
	const router = useRouter();
	const isWide = useIsWideLayout();
	const [initial] = useState<BookEditValues>(() => bookToEditValues(book));
	const form = useEditForm(initial);
	const [seriesChoice, setSeriesChoice] = useState<SeriesChoice>(() => seriesChoiceOf(membership));
	const { data: collections = [] } = queryHooks.useCollections();
	const { data: library } = queryHooks.useBooks();
	const updateBook = queryHooks.useUpdateBook();
	const saveSeries = queryHooks.useSaveBookSeries();
	// Same query as the detail page, so its About text is usually cached already.
	const { data: catalogMeta } = useQuery({
		queryKey: book.catalogId ? catalogKeys.book(book.catalogId) : ["catalog", "book", "noop"],
		queryFn: ({ signal }) =>
			book.catalogId ? getCatalogBook(book.catalogId, signal) : Promise.resolve(null),
		enabled: !!book.catalogId,
	});
	const catalogDescription = useMemo(
		() =>
			(catalogMeta?.description ? plainText(catalogMeta.description) : catalogMeta?.summary) ||
			null,
		[catalogMeta],
	);

	const isDirty =
		isEditDirty(initial, form.values, form.tagDraft) || isSeriesDirty(membership, seriesChoice);
	const isSaving = updateBook.isPending || saveSeries.isPending;
	// A ref, not state: the save navigates in the same tick it finishes, before
	// a re-render could tell the blocker the changes are stored.
	const isLeavingRef = useRef(false);
	// Back during a save would prompt, then the finished save steps back again.
	useOverlayBack(isSaving, noop, false);

	const blocker = useBlocker({
		shouldBlockFn: () => isDirty && !isLeavingRef.current,
		enableBeforeUnload: () => isDirty && !isLeavingRef.current,
		withResolver: true,
	});

	// Back, not a navigation: Edit opens from the library, the detail page and
	// the reader, and back returns to whichever it was with its scroll restored.
	const leave = () => {
		if (router.history.canGoBack()) {
			router.history.back();
		} else {
			void router.navigate({
				to: "/tabs/library/book/$id",
				params: { id: book.id },
				replace: true,
			});
		}
	};

	const save = async () => {
		const values = finalizeEditValues(form.values, form.tagDraft);
		if (!values.title) return;
		try {
			await updateBook.mutateAsync({ id: book.id, values: editValuesToPatch(values) });
			const plan = planSeriesChange(membership, seriesChoice);
			if (plan.remove || plan.add) await saveSeries.mutateAsync({ bookId: book.id, plan });
		} catch {
			// Both mutations toast their own failure; the form stays for a retry.
			return;
		}
		isLeavingRef.current = true;
		leave();
	};

	const cover =
		library?.covers.get(book.id) ?? (book.catalogId ? getCoverUrl(book.catalogId) : null);
	const facts = [wordCountFact(book.wordCount), `Added ${formatShortDate(book.addedAt)}`].filter(
		(f): f is string => f !== null,
	);

	return (
		<BookEditLayout
			title="Edit book"
			closeIcon="back"
			status={isDirty ? <UnsavedMark isWide={isWide} /> : null}
			cancelLabel="Cancel"
			saveLabel="Save"
			onCancel={leave}
			onSave={() => void save()}
			canSave={form.values.title.trim().length > 0}
			isSaving={isSaving}
			isBusy={isSaving}
		>
			<BookEditFields
				form={form}
				isWide={isWide}
				cover={cover}
				format={book.fileFormat}
				facts={facts}
				catalogDescription={catalogDescription}
				progress={{
					wordCount: book.wordCount,
					wordPosition: book.wordPosition,
					finishedAt: book.finishedAt,
				}}
				series={
					<SeriesField
						choice={seriesChoice}
						onChange={(next) => {
							if (next.kind !== "detected") setSeriesChoice(next);
						}}
						collections={collections}
						bookId={book.id}
					/>
				}
			/>
			<AlertDialog
				open={blocker.status === "blocked"}
				onOpenChange={(open) => {
					if (!open) blocker.reset?.();
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Discard changes?</AlertDialogTitle>
						<AlertDialogDescription>
							Your edits to this book aren't saved yet.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep editing</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => blocker.proceed?.()}
						>
							Discard
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</BookEditLayout>
	);
};

export default BookEditPage;
