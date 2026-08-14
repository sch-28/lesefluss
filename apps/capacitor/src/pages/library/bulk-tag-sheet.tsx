import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { Input } from "@lesefluss/ui/input";
import { Check, Minus, Plus, X } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import type { Book } from "../../services/db/schema";
import { FIELD_LIMITS } from "./book-fields";
import { bookCount } from "./bulk-summary";
import { hasPendingIntent, nextIntent, type TagIntent, type TagRow, tagRows } from "./bulk-tags";

type Props = {
	isOpen: boolean;
	picked: Book[];
	/** Tags in use across the whole library, so one can be reused without typing. */
	libraryTags: string[];
	onClose: () => void;
	onApply: (intents: ReadonlyMap<string, TagIntent>) => void;
};

/** What a row shows once the reader has said what they want done with it. */
function rowHint(row: TagRow, intent: TagIntent, total: number): string {
	if (intent === "add") return "Add to all";
	if (intent === "remove") return "Remove from all";
	if (row.state === "all") return "On all";
	if (row.state === "some") return `On ${row.count} of ${total}`;
	return "Not applied";
}

const BulkTagSheet: React.FC<Props> = ({ isOpen, picked, libraryTags, onClose, onApply }) => {
	const [intents, setIntents] = useState<Map<string, TagIntent>>(new Map());
	const [draft, setDraft] = useState("");
	const [minted, setMinted] = useState<string[]>([]);

	// Only while open: this sheet never unmounts, and `tagRows` parses the tags
	// JSON of every picked book.
	const rows = useMemo(
		() => (isOpen ? tagRows(picked, [...libraryTags, ...minted]) : []),
		[isOpen, picked, libraryTags, minted],
	);

	// Reset on close rather than in the close handlers: the sheet never unmounts,
	// and Android back closes it by flipping this prop without going through any
	// of them — which would carry one selection's intents into the next.
	useEffect(() => {
		if (isOpen) return;
		setIntents(new Map());
		setDraft("");
		setMinted([]);
	}, [isOpen]);

	const cycle = (row: TagRow) => {
		setIntents((current) => {
			const next = new Map(current);
			next.set(row.tag, nextIntent(row.state, current.get(row.tag) ?? "leave"));
			return next;
		});
	};

	/** The intents plus whatever is still sitting in the input, so a typed tag is
	 *  never silently dropped by Apply. */
	const withDraft = (current: ReadonlyMap<string, TagIntent>): Map<string, TagIntent> => {
		const tag = draft.trim();
		const next = new Map(current);
		// A new tag arrives wanting to be applied; anything else would need a
		// second tap to do the only thing typing it could have meant.
		if (tag) next.set(tag, "add");
		return next;
	};

	const addDraft = () => {
		const tag = draft.trim();
		if (!tag) return;
		if (!rows.some((row) => row.tag === tag)) setMinted((current) => [...current, tag]);
		setIntents(withDraft);
		setDraft("");
	};

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Tags · {bookCount(picked.length)}</DrawerTitle>
				</DrawerHeader>

				<div className="flex items-center gap-2 px-4 pb-2">
					<Input
						value={draft}
						placeholder="New tag"
						maxLength={FIELD_LIMITS.tagsJson}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") addDraft();
						}}
					/>
					<Button variant="outline" size="icon" aria-label="Add tag" onClick={addDraft}>
						<Plus />
					</Button>
				</div>

				<div className="max-h-[50vh] overflow-y-auto px-2 pb-2">
					{rows.length === 0 && (
						<p className="m-0 px-2 py-6 text-center text-muted-foreground text-sm">
							No tags yet. Type one above to put it on {bookCount(picked.length)}.
						</p>
					)}
					{rows.map((row) => {
						const intent = intents.get(row.tag) ?? "leave";
						return (
							<button
								key={row.tag}
								type="button"
								onClick={() => cycle(row)}
								className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted"
							>
								<span
									className={`flex size-5 shrink-0 items-center justify-center rounded-sm border ${
										intent === "add" || (intent === "leave" && row.state === "all")
											? "border-primary bg-primary text-primary-foreground"
											: intent === "remove"
												? "border-destructive text-destructive"
												: "border-border"
									}`}
								>
									{intent === "remove" ? (
										<X className="size-3.5" />
									) : intent === "add" || row.state === "all" ? (
										<Check className="size-3.5" />
									) : row.state === "some" ? (
										<Minus className="size-3.5 text-muted-foreground" />
									) : null}
								</span>
								<span className="min-w-0 flex-1 truncate text-sm">{row.tag}</span>
								<span className="shrink-0 text-muted-foreground text-xs">
									{rowHint(row, intent, picked.length)}
								</span>
							</button>
						);
					})}
				</div>

				<div className="flex gap-2 border-border border-t p-4">
					<Button variant="outline" className="flex-1" onClick={onClose}>
						Cancel
					</Button>
					<Button
						className="flex-1"
						disabled={!hasPendingIntent(withDraft(intents))}
						onClick={() => onApply(withDraft(intents))}
					>
						Apply
					</Button>
				</div>
			</DrawerContent>
		</Drawer>
	);
};

export default BulkTagSheet;
