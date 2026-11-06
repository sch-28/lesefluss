import { COLLECTION_NAME_MAX } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { Input } from "@lesefluss/ui/input";
import { Check, Plus } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { queryHooks } from "../../services/db/hooks";
import type { Book } from "../../services/db/schema";

type Props = {
	/** The book whose collections are edited; null closes the drawer. */
	book: Book | null;
	onClose: () => void;
};

/** One book's membership: each tap adds it to or removes it from a collection at once. */
const CollectionPicker: React.FC<Props> = ({ book, onClose }) => {
	const { data: collections = [] } = queryHooks.useCollections();
	const { data: memberOf = [] } = queryHooks.useCollectionIdsForBook(book?.id ?? null);
	const add = queryHooks.useAddBooksToCollection();
	const remove = queryHooks.useRemoveBooksFromCollection();
	const create = queryHooks.useCreateCollection();
	const [draft, setDraft] = useState("");

	useEffect(() => {
		if (!book) setDraft("");
	}, [book]);

	const toggle = (collectionId: string) => {
		if (!book) return;
		const vars = { collectionId, bookIds: [book.id] };
		if (memberOf.includes(collectionId)) remove.mutate(vars);
		else add.mutate(vars);
	};

	const createAndAdd = () => {
		const name = draft.trim();
		if (!name || !book) return;
		setDraft("");
		create.mutate(name, {
			onSuccess: (row) => add.mutate({ collectionId: row.id, bookIds: [book.id] }),
		});
	};

	return (
		<Drawer
			open={!!book}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle className="truncate">Collections · {book?.title}</DrawerTitle>
				</DrawerHeader>

				<div className="max-h-[50vh] overflow-y-auto px-2 pb-2">
					{collections.length === 0 && (
						<p className="m-0 px-2 py-6 text-center text-muted-foreground text-sm">
							No collections yet. Name one below to start it with this book.
						</p>
					)}
					{collections.map((c) => {
						const isMember = memberOf.includes(c.id);
						return (
							<button
								key={c.id}
								type="button"
								aria-pressed={isMember}
								onClick={() => toggle(c.id)}
								className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted"
							>
								<span
									className={`flex size-5 shrink-0 items-center justify-center rounded-sm border ${
										isMember ? "border-primary bg-primary text-primary-foreground" : "border-border"
									}`}
								>
									{isMember && <Check className="size-3.5" />}
								</span>
								<span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
								<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
									{c.bookCount}
								</span>
							</button>
						);
					})}
				</div>

				<div className="flex items-center gap-2 border-border border-t p-4">
					<Input
						value={draft}
						placeholder="New collection"
						aria-label="New collection name"
						maxLength={COLLECTION_NAME_MAX}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") createAndAdd();
						}}
					/>
					<Button
						variant="outline"
						size="icon"
						aria-label="Create collection and add this book"
						disabled={!draft.trim()}
						onClick={createAndAdd}
					>
						<Plus />
					</Button>
				</div>
			</DrawerContent>
		</Drawer>
	);
};

export default CollectionPicker;
