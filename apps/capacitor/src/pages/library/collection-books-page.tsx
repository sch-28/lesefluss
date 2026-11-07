import { bookStatus, COLLECTION_NAME_MAX } from "@lesefluss/core";
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
import { Input } from "@lesefluss/ui/input";
import { Label } from "@lesefluss/ui/label";
import { useOverlayBack } from "@lesefluss/ui/overlay-back";
import { Switch } from "@lesefluss/ui/switch";
import { useBlocker, useRouter } from "@tanstack/react-router";
import { ChevronRight, FileUp } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { importRequest } from "../../commands/global";
import { BookSelection, type QuickFilter } from "../../components/collections/book-selection";
import { queryHooks } from "../../services/db/hooks";
import type { CollectionWithCount } from "../../services/db/queries/collections";
import type { Book } from "../../services/db/schema";
import { BookEditLayout, UnsavedMark, useIsWideLayout } from "./book-edit-layout";

export type CollectionPageMode =
	| { kind: "create" }
	| { kind: "add"; id: string }
	| { kind: "edit"; id: string };

const noop = () => {};
const NO_MEMBERS: readonly string[] = [];

const books = (n: number) => `${n} ${n === 1 ? "book" : "books"}`;

/** Create, add-to and edit for a collection: one page, one book picker. */
const CollectionBooksPage: React.FC<{ mode: CollectionPageMode }> = ({ mode }) => {
	const collectionId = mode.kind === "create" ? null : mode.id;
	const library = queryHooks.useBooks();
	const collections = queryHooks.useCollections();
	const members = queryHooks.useCollectionBookIds(collectionId);
	const memberships = queryHooks.useCollectionMemberships();

	if (
		library.isPending ||
		collections.isPending ||
		memberships.isPending ||
		(collectionId !== null && members.isPending)
	) {
		return <p className="p-6 text-center text-muted-foreground text-sm">Loading…</p>;
	}
	const collection = collections.data?.find((c) => c.id === collectionId) ?? null;
	if (collectionId !== null && !collection) {
		return <p className="p-6 text-center text-muted-foreground text-sm">Collection not found.</p>;
	}
	return (
		// Seeded once: a sync pull refreshing members mid-edit must not drop the picks.
		<CollectionBooksForm
			mode={mode}
			collection={collection}
			members={members.data ?? NO_MEMBERS}
			books={library.data?.books ?? []}
			covers={library.data?.covers}
			memberships={memberships.data}
		/>
	);
};

type FormProps = {
	mode: CollectionPageMode;
	collection: CollectionWithCount | null;
	members: readonly string[];
	books: readonly Book[];
	covers?: ReadonlyMap<string, string>;
	memberships?: ReadonlyMap<string, readonly string[]>;
};

export const CollectionBooksForm: React.FC<FormProps> = ({
	mode,
	collection,
	members,
	books: library,
	covers,
	memberships,
}) => {
	const router = useRouter();
	const isWide = useIsWideLayout();
	const [memberIds] = useState(() => new Set(members));
	const [name, setName] = useState(collection?.name ?? "");
	const [ordered, setOrdered] = useState(collection?.ordered ?? false);
	const [selected, setSelected] = useState<Set<string>>(() =>
		mode.kind === "edit" ? new Set(members) : new Set(),
	);
	const create = queryHooks.useCreateCollectionWithBooks();
	const edit = queryHooks.useEditCollection();
	const isSaving = create.isPending || edit.isPending;

	const added = useMemo(
		() => (mode.kind === "edit" ? [...selected].filter((id) => !memberIds.has(id)) : [...selected]),
		[mode.kind, selected, memberIds],
	);
	const removed = useMemo(
		() => (mode.kind === "edit" ? [...memberIds].filter((id) => !selected.has(id)) : []),
		[mode.kind, selected, memberIds],
	);
	const trimmed = name.trim();
	const nameChanged = mode.kind === "edit" && trimmed !== collection?.name;
	const orderChanged = mode.kind === "edit" && ordered !== collection?.ordered;
	const pickCount = added.length + removed.length;
	const isDirty =
		mode.kind === "create"
			? trimmed !== "" || selected.size > 0 || ordered
			: pickCount > 0 || nameChanged || orderChanged;
	const canSave =
		mode.kind === "add" ? selected.size > 0 : trimmed !== "" && (mode.kind === "create" || isDirty);

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

	// Raised on unmount rather than on tap: the library answers it, and a
	// "keep editing" in the discard prompt must not open the import sheet later.
	const importOnLeaveRef = useRef(false);
	useEffect(
		() => () => {
			if (importOnLeaveRef.current) importRequest.raise();
		},
		[],
	);

	const showCollection = (id: string) =>
		router.navigate({ to: "/tabs/library", search: { collection: id }, replace: true });

	const leave = () => {
		if (router.history.canGoBack()) router.history.back();
		else if (collection) void showCollection(collection.id);
		else void router.navigate({ to: "/tabs/library", search: {}, replace: true });
	};

	const importInto = () => {
		if (!collection) return;
		importOnLeaveRef.current = true;
		if (mode.kind === "add" && router.history.canGoBack()) router.history.back();
		else void showCollection(collection.id);
	};

	const save = async () => {
		if (!canSave || isSaving) return;
		try {
			if (mode.kind === "create") {
				const row = await create.mutateAsync({ name: trimmed, bookIds: [...selected], ordered });
				isLeavingRef.current = true;
				void showCollection(row.id);
				return;
			}
			await edit.mutateAsync({
				id: mode.id,
				edit: {
					name: nameChanged ? trimmed : undefined,
					ordered: orderChanged ? ordered : undefined,
					add: added,
					remove: removed,
				},
			});
		} catch {
			// The mutation toasts its own failure; the page stays for a retry.
			return;
		}
		isLeavingRef.current = true;
		leave();
	};

	const quickFilters = useMemo<QuickFilter[]>(
		() => [
			{ id: "reading", label: "Reading", matches: (b) => bookStatus(b) === "reading" },
			{ id: "want", label: "Want to read", matches: (b) => bookStatus(b) === "want" },
			collection
				? {
						id: "outside",
						label: `Not in ${collection.name}`,
						matches: (b) => !memberIds.has(b.id),
					}
				: {
						id: "outside",
						label: "Not in a collection",
						matches: (b) => !memberships?.get(b.id)?.length,
					},
		],
		[collection, memberIds, memberships],
	);

	const title =
		mode.kind === "create"
			? "New collection"
			: mode.kind === "add"
				? `Add to ${collection?.name}`
				: "Edit collection";
	const saveLabel =
		mode.kind === "create"
			? selected.size > 0
				? `Create with ${books(selected.size)}`
				: "Create collection"
			: mode.kind === "add"
				? selected.size > 0
					? `Add ${books(selected.size)}`
					: "Add books"
				: "Save";
	const onlyPicks =
		mode.kind === "create" ? trimmed === "" && !ordered : !nameChanged && !orderChanged;
	const picksPending = mode.kind === "edit" ? pickCount : selected.size;

	return (
		<BookEditLayout
			title={title}
			closeIcon={mode.kind === "create" ? "close" : "back"}
			status={isDirty ? <UnsavedMark isWide={isWide} /> : null}
			cancelLabel="Cancel"
			saveLabel={saveLabel}
			onCancel={leave}
			onSave={() => void save()}
			canSave={canSave}
			isSaving={isSaving}
			isBusy={isSaving}
		>
			<div className="flex flex-col gap-4">
				{mode.kind !== "add" && (
					// A form, so the Android keyboard's action key submits by implicit submission.
					<form
						className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
						onSubmit={(e) => {
							e.preventDefault();
							void save();
						}}
					>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="collection-name">Name</Label>
							<Input
								id="collection-name"
								autoFocus={mode.kind === "create"}
								value={name}
								maxLength={COLLECTION_NAME_MAX}
								placeholder="Collection name"
								enterKeyHint="done"
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<Label htmlFor="collection-ordered">Keep in order</Label>
								<p className="m-0 text-muted-foreground text-xs">
									{mode.kind === "create"
										? "Numbers books #1, #2… in the order you pick them"
										: "Numbers books in reading order; new ones go last"}
								</p>
							</div>
							<Switch id="collection-ordered" checked={ordered} onCheckedChange={setOrdered} />
						</div>
					</form>
				)}

				{collection && (
					<button
						type="button"
						onClick={importInto}
						className="flex items-center gap-3 rounded-xl border border-border border-dashed bg-card p-3 text-left hover:bg-muted"
					>
						<FileUp className="size-5 shrink-0 text-muted-foreground" />
						<span className="min-w-0 flex-1">
							<span className="block font-medium text-sm">Import new files</span>
							<span className="block text-muted-foreground text-xs">
								They land in {mode.kind === "edit" && trimmed ? trimmed : collection.name}
							</span>
						</span>
						<ChevronRight className="size-4 text-muted-foreground" />
					</button>
				)}

				<BookSelection
					books={library}
					selected={selected}
					onSelectedChange={setSelected}
					lockedIds={mode.kind === "add" ? memberIds : undefined}
					lockedLabel={collection ? `In ${collection.name}` : undefined}
					layout={isWide ? "grid" : "rows"}
					quickFilters={quickFilters}
					showOrder={mode.kind === "create" && ordered}
					covers={covers}
				/>
			</div>

			<AlertDialog
				open={blocker.status === "blocked"}
				onOpenChange={(open) => {
					if (!open) {
						if (!isLeavingRef.current) importOnLeaveRef.current = false;
						blocker.reset?.();
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{onlyPicks
								? `Discard ${picksPending} ${picksPending === 1 ? "pick" : "picks"}?`
								: "Discard changes?"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{mode.kind === "create"
								? "The collection isn't created yet."
								: "Your changes to this collection aren't saved yet."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep editing</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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

export default CollectionBooksPage;
