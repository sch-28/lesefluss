import { COLLECTION_NAME_MAX, normalizeSeriesKey, seriesCollectionId } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { Input } from "@lesefluss/ui/input";
import { Check, Minus, Plus } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useBackHandler } from "../../hooks/use-back-handler";
import { queryHooks } from "../../services/db/hooks";
import type { NumberedTarget } from "../../services/db/hooks/use-collections";
import type { CollectionWithCount } from "../../services/db/queries/collections";
import type { Book } from "../../services/db/schema";
import { toast } from "../toast";
import { SeriesNumberStep } from "./series-number-step";

type Props = {
	/** The books to place, in view order: Set #N numbers them in this order. */
	books: readonly Book[];
	open: boolean;
	onClose: () => void;
	/** Series only, or collections only; both when absent. */
	kind?: PickerKind;
};

export type PickerKind = "series" | "collection";

export type Mark = "all" | "some" | "none";

type NumberStep = { target: NumberedTarget; name: string };

const NO_IDS: readonly string[] = [];
const NO_MEMBERS = new Map<string, number | null>();

const books = (n: number) => `${n} ${n === 1 ? "book" : "books"}`;

export function markOf(
	collectionId: string,
	bookIds: readonly string[],
	memberships: ReadonlyMap<string, readonly string[]> | undefined,
): { mark: Mark; count: number } {
	const count = bookIds.filter((id) => memberships?.get(id)?.includes(collectionId)).length;
	return { mark: count === 0 ? "none" : count === bookIds.length ? "all" : "some", count };
}

/**
 * Puts books into collections: one book from its menu, or a selection.
 *
 * A plain collection takes a tap at once. An ordered or series collection, and
 * a new series, go through Set #N first, so the numbers are seen before they
 * are written, and the step is where they come out again. A plain row every
 * book is in asks, with the count, before it takes them all out. Out of a
 * series, later imports leave them out.
 */
export const CollectionPickerSheet: React.FC<Props> = ({ books: placed, open, onClose, kind }) => {
	const { data: allCollections = [] } = queryHooks.useCollections();
	const collections = useMemo(
		() =>
			kind === undefined
				? allCollections
				: allCollections.filter((c) => (c.seriesKey !== null) === (kind === "series")),
		[allCollections, kind],
	);
	const { data: memberships } = queryHooks.useCollectionMemberships();
	const add = queryHooks.useAddBooksToCollection();
	const remove = queryHooks.useRemoveBooksFromCollection();
	const createWithBooks = queryHooks.useCreateCollectionWithBooks();
	const addNumbered = queryHooks.useAddNumberedBooks();
	const [draft, setDraft] = useState("");
	const [step, setStep] = useState<NumberStep | null>(null);
	const [removing, setRemoving] = useState<CollectionWithCount | null>(null);
	const stepCollectionId = step && "collectionId" in step.target ? step.target.collectionId : null;
	const members = queryHooks.useCollectionMembers(stepCollectionId);
	const ids = useMemo(() => (open ? placed.map((b) => b.id) : NO_IDS), [open, placed]);

	useEffect(() => {
		if (open) return;
		setDraft("");
		setStep(null);
		setRemoving(null);
	}, [open]);

	// Registered after the drawer's own handler, so back leaves the step first.
	useBackHandler(open && (step !== null || removing !== null), () => {
		setStep(null);
		setRemoving(null);
	});

	const memberNumbers = useMemo(
		() =>
			stepCollectionId === null
				? NO_MEMBERS
				: new Map((members.data ?? []).map((m) => [m.bookId, m.seriesIndex])),
		[stepCollectionId, members.data],
	);

	const pick = (c: CollectionWithCount) => {
		if (ids.length === 0) return;
		if (c.ordered) {
			setStep({ target: { collectionId: c.id }, name: c.name });
		} else if (markOf(c.id, ids, memberships).mark === "all") {
			setRemoving(c);
		} else {
			add.mutate({ collectionId: c.id, bookIds: [...ids] });
		}
	};

	const createCollection = () => {
		const name = draft.trim();
		if (!name || ids.length === 0) return;
		setDraft("");
		createWithBooks.mutate({ name, bookIds: ids });
	};

	const createSeries = () => {
		const name = draft.trim();
		const key = normalizeSeriesKey(name);
		if (!key || ids.length === 0) return;
		setDraft("");
		const live = allCollections.find((c) => c.id === seriesCollectionId(key));
		setStep(
			live
				? { target: { collectionId: live.id }, name: live.name }
				: { target: { newSeries: name }, name },
		);
	};

	const apply = (current: NumberStep, numbers: Map<string, number | null>) => {
		addNumbered.mutate(
			{ target: current.target, numbers },
			{
				onSuccess: () => {
					toast.success(`${books(numbers.size)} in ${current.name}`);
					onClose();
				},
			},
		);
	};

	const confirmRemove = (c: CollectionWithCount) => {
		remove.mutate({ collectionId: c.id, bookIds: [...ids] });
		setRemoving(null);
	};

	const removeFromStep = () => {
		if (stepCollectionId === null) return;
		const inIt = ids.filter((id) => memberNumbers.has(id));
		remove.mutate({ collectionId: stepCollectionId, bookIds: inIt });
		setStep(null);
	};
	const stepHasMembers = ids.some((id) => memberNumbers.has(id));

	const noun = kind === "series" ? "Series" : "Collections";
	const title =
		placed.length === 1 ? `${noun} · ${placed[0]?.title}` : `Add ${books(placed.length)}`;
	const offersCollection = kind !== "series";
	const offersSeries = kind !== "collection";
	const draftNoun =
		kind === "series" ? "series" : kind === "collection" ? "collection" : "collection or series";

	return (
		<Drawer
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle className="truncate">
						{step ? `Set #N · ${step.name}` : removing ? `Remove from ${removing.name}?` : title}
					</DrawerTitle>
				</DrawerHeader>

				{removing ? (
					<div data-testid="collection-remove-confirm" className="flex flex-col">
						<p className="m-0 px-4 pb-2 text-muted-foreground text-sm">
							{placed.length === 1
								? `"${placed[0]?.title}" leaves ${removing.name}.`
								: `All ${books(ids.length)} leave ${removing.name}.`}{" "}
							{placed.length === 1 ? "It stays" : "They stay"} in your library.
						</p>
						<div className="flex justify-end gap-2 border-border border-t p-4">
							<Button variant="outline" onClick={() => setRemoving(null)}>
								Cancel
							</Button>
							<Button variant="destructive" onClick={() => confirmRemove(removing)}>
								Remove {books(ids.length)}
							</Button>
						</div>
					</div>
				) : step ? (
					<SeriesNumberStep
						name={step.name}
						books={placed}
						members={memberNumbers}
						isApplying={addNumbered.isPending || (stepCollectionId !== null && members.isPending)}
						onBack={() => setStep(null)}
						onRemove={stepHasMembers ? removeFromStep : undefined}
						onApply={(numbers) => apply(step, numbers)}
					/>
				) : (
					<>
						<div className="max-h-[50vh] overflow-y-auto px-2 pb-2">
							{collections.length === 0 && (
								<p className="m-0 px-2 py-6 text-center text-muted-foreground text-sm">
									{kind === "series" ? "No series yet." : "No collections yet."} Name one below to
									start it with {placed.length === 1 ? "this book" : "these books"}.
								</p>
							)}
							{collections.map((c) => (
								<CollectionRow
									key={c.id}
									collection={c}
									{...markOf(c.id, ids, memberships)}
									total={ids.length}
									onPick={() => pick(c)}
								/>
							))}
						</div>

						<div className="flex flex-col gap-2 border-border border-t p-4">
							<Input
								value={draft}
								placeholder={`Name a new ${draftNoun}`}
								aria-label={`New ${draftNoun} name`}
								maxLength={COLLECTION_NAME_MAX}
								onChange={(e) => setDraft(e.target.value)}
								onKeyDown={(e) => {
									if (e.key !== "Enter") return;
									if (offersCollection) createCollection();
									else createSeries();
								}}
							/>
							<div className="flex gap-2">
								{offersCollection && (
									<Button
										variant="outline"
										className="flex-1"
										disabled={!draft.trim()}
										onClick={createCollection}
									>
										<Plus /> New collection
									</Button>
								)}
								{offersSeries && (
									<Button
										variant="outline"
										className="flex-1"
										disabled={!normalizeSeriesKey(draft)}
										onClick={createSeries}
									>
										<Plus /> New series
									</Button>
								)}
							</div>
						</div>
					</>
				)}
			</DrawerContent>
		</Drawer>
	);
};

const CollectionRow: React.FC<{
	collection: CollectionWithCount;
	mark: Mark;
	count: number;
	total: number;
	onPick: () => void;
}> = ({ collection: c, mark, count, total, onPick }) => (
	<button
		type="button"
		aria-pressed={mark === "all" ? true : mark === "some" ? "mixed" : false}
		data-testid="collection-picker-row"
		onClick={onPick}
		className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted"
	>
		<span
			className={`flex size-5 shrink-0 items-center justify-center rounded-sm border ${
				mark === "none" ? "border-border" : "border-primary bg-primary text-primary-foreground"
			}`}
		>
			{mark === "all" && <Check className="size-3.5" />}
			{mark === "some" && <Minus className="size-3.5" />}
		</span>
		<span className="min-w-0 flex-1">
			<span className="block truncate text-sm">{c.name}</span>
			{mark === "some" && (
				<span className="block text-muted-foreground text-xs">
					On {count} of {total}
				</span>
			)}
		</span>
		{(c.seriesKey !== null || c.ordered) && (
			<span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
				{c.seriesKey !== null ? "Series" : "Ordered"}
			</span>
		)}
		<span className="shrink-0 text-muted-foreground text-xs tabular-nums">{c.bookCount}</span>
	</button>
);
