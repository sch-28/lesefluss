import { Capacitor } from "@capacitor/core";
import { SMART_SHELF_CONDITIONS_MAX, SMART_SHELF_NAME_MAX } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@lesefluss/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@lesefluss/ui/drawer";
import { Input } from "@lesefluss/ui/input";
import { SheetDoneButton, SheetHeaderBar } from "@lesefluss/ui/sheet-header";
import { cn } from "@lesefluss/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal, Plus, X } from "lucide-react";
import type React from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { useLocalDayNow } from "../../hooks/use-local-day";
import { useMediaQuery } from "../../hooks/use-media-query";
import { queryHooks } from "../../services/db/hooks";
import { ConditionRow } from "./condition-row";
import {
	type ConditionGroup,
	type ConditionTree,
	matchesTree,
	serializeTree,
	treeToFilter,
} from "./condition-tree";
import { encodeFilterParam } from "./filter-model";
import type { FacetOptions } from "./filter-picker";
import {
	append,
	canAddGroup,
	type DraftGroup,
	type DraftNode,
	fromDraft,
	hasEmptyGroup,
	isDraftComplete,
	isDraftGroup,
	moveBy,
	moveIntoGroup,
	moveNode,
	newCondition,
	newGroup,
	removeNode,
	setGroupOp,
	toDraft,
	updateCondition,
} from "./shelf-condition-draft";
import { type ShelfEntry, useShelfLibrary } from "./use-smart-shelves";

const COUNT_DEBOUNCE_MS = 150;

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** null creates a new shelf. */
	shelf: ShelfEntry | null;
	/** Starts from these instead of the shelf's saved conditions, e.g. its chips as edited. */
	initialTree?: ConditionTree;
};

type DropAt = { groupId: string; index: number };

type Editing = {
	root: DraftGroup;
	setRoot: (root: DraftGroup) => void;
	options: FacetOptions;
	isStacked: boolean;
	menuFor: string | null;
	toggleMenu: (id: string) => void;
	drag: {
		id: string | null;
		dropAt: DropAt | null;
		start: (id: string) => void;
		over: (at: DropAt) => void;
		drop: () => void;
		end: () => void;
	};
};

const EMPTY_ROOT: ConditionGroup = { op: "and", items: [] };

const MatchSwitch: React.FC<{
	op: string;
	onChange: (op: "and" | "or") => void;
}> = ({ op, onChange }) => (
	<fieldset aria-label="Match" className="m-0 inline-flex rounded-md border border-border p-0.5">
		{(["and", "or"] as const).map((value) => (
			<button
				key={value}
				type="button"
				aria-pressed={op === value}
				onClick={() => onChange(value)}
				className={cn(
					"rounded px-2 py-0.5 font-medium text-xs uppercase tracking-wide",
					op === value ? "bg-primary text-primary-foreground" : "text-muted-foreground",
				)}
			>
				{value === "and" ? "All" : "Any"}
			</button>
		))}
	</fieldset>
);

/** Up, down and into a group: how a row moves without a drag, and on the phone. */
const MoveStrip: React.FC<{ id: string; editing: Editing; label: string }> = ({
	id,
	editing,
	label,
}) => {
	const { root, setRoot } = editing;
	const moves = [
		{ label: "Move up", icon: ArrowUp, next: moveBy(root, id, -1) },
		{ label: "Move down", icon: ArrowDown, next: moveBy(root, id, 1) },
		{ label: "Into group", icon: Plus, next: moveIntoGroup(root, id) },
	];
	return (
		<div role="toolbar" aria-label={`Move ${label}`} className="flex flex-wrap gap-1.5 pl-1">
			{moves.map(({ label: name, icon: Icon, next }) => (
				<Button
					key={name}
					type="button"
					size="xs"
					variant="outline"
					disabled={next === root}
					onClick={() => setRoot(next)}
				>
					<Icon />
					{name}
				</Button>
			))}
		</div>
	);
};

/** Before or after `index` in `groupId`, by which half of the row the pointer is over. */
function dropHandlers(editing: Editing, groupId: string, index: number) {
	if (!editing.drag.id) return {};
	return {
		onDragOver: (e: React.DragEvent<HTMLElement>) => {
			e.preventDefault();
			e.stopPropagation();
			const rect = e.currentTarget.getBoundingClientRect();
			const after = e.clientY > rect.top + rect.height / 2;
			editing.drag.over({ groupId, index: after ? index + 1 : index });
		},
		onDrop: (e: React.DragEvent<HTMLElement>) => {
			e.preventDefault();
			e.stopPropagation();
			editing.drag.drop();
		},
	};
}

const DropLine: React.FC<{ editing: Editing; groupId: string; index: number }> = ({
	editing,
	groupId,
	index,
}) => {
	const at = editing.drag.dropAt;
	if (!editing.drag.id || at?.groupId !== groupId || at.index !== index) return null;
	return <div aria-hidden className="h-0.5 rounded-full bg-primary" />;
};

const DragHandle: React.FC<{ id: string; editing: Editing; label: string }> = ({
	id,
	editing,
	label,
}) => (
	<button
		type="button"
		draggable
		aria-label={`Move ${label}`}
		aria-expanded={editing.menuFor === id}
		onClick={() => editing.toggleMenu(id)}
		onDragStart={(e) => {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", id);
			const row = e.currentTarget.closest("[data-drag-node]");
			if (row) e.dataTransfer.setDragImage(row, 16, 16);
			editing.drag.start(id);
		}}
		onDragEnd={editing.drag.end}
		className="inline-flex size-7 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
	>
		<GripVertical className="size-4" />
	</button>
);

const RemoveButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
	<button
		type="button"
		aria-label={label}
		onClick={onClick}
		className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
	>
		<X className="size-4" />
	</button>
);

const MenuButton: React.FC<{ id: string; editing: Editing; label: string }> = ({
	id,
	editing,
	label,
}) => (
	<button
		type="button"
		aria-label={label}
		aria-expanded={editing.menuFor === id}
		onClick={() => editing.toggleMenu(id)}
		className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
	>
		<MoreHorizontal className="size-4" />
	</button>
);

const GroupTools: React.FC<{ group: DraftGroup; editing: Editing }> = ({ group, editing }) => {
	const { root, setRoot } = editing;
	return (
		<div className="flex gap-1.5" {...dropHandlers(editing, group.id, group.items.length)}>
			<Button
				type="button"
				size="xs"
				variant="ghost"
				onClick={() => setRoot(append(root, group.id, newCondition()))}
			>
				<Plus />
				Condition
			</Button>
			{canAddGroup(root, group.id) && (
				<Button
					type="button"
					size="xs"
					variant="ghost"
					onClick={() => setRoot(append(root, group.id, newGroup()))}
				>
					<Plus />
					Group
				</Button>
			)}
		</div>
	);
};

const NodeView: React.FC<{
	node: DraftNode;
	group: DraftGroup;
	index: number;
	editing: Editing;
}> = ({ node, group, index, editing }) => {
	const { root, setRoot, isStacked, menuFor } = editing;
	const isMenuOpen = menuFor === node.id;

	if (isDraftGroup(node)) {
		return (
			<div
				data-drag-node
				data-testid="condition-group"
				data-incomplete={node.items.length === 0 || undefined}
				className={cn(
					"flex flex-col gap-2 rounded-r-lg border-primary/55 border-l-2 bg-gradient-to-r from-primary/5 to-transparent py-2 pr-1 pl-3",
					node.items.length === 0 &&
						"outline-dashed outline-1 outline-destructive/70 outline-offset-2",
				)}
				{...dropHandlers(editing, group.id, index)}
			>
				<div className="flex items-center gap-2">
					{!isStacked && <DragHandle id={node.id} editing={editing} label="group" />}
					<span className="text-muted-foreground text-xs">Match</span>
					<MatchSwitch op={node.op} onChange={(op) => setRoot(setGroupOp(root, node.id, op))} />
					<span className="flex-1 text-muted-foreground text-xs">of</span>
					{isStacked && <MenuButton id={node.id} editing={editing} label="Group options" />}
					<RemoveButton label="Remove group" onClick={() => setRoot(removeNode(root, node.id))} />
				</div>
				{isMenuOpen && <MoveStrip id={node.id} editing={editing} label="group" />}
				<GroupItems group={node} editing={editing} />
				<GroupTools group={node} editing={editing} />
			</div>
		);
	}

	return (
		<div
			data-drag-node
			className="flex flex-col gap-1.5"
			{...dropHandlers(editing, group.id, index)}
		>
			<ConditionRow
				cond={node}
				options={editing.options}
				isStacked={isStacked}
				onChange={(cond) => setRoot(updateCondition(root, node.id, cond))}
				leading={
					isStacked ? undefined : <DragHandle id={node.id} editing={editing} label="condition" />
				}
				trailing={
					<span className="flex shrink-0 items-center">
						{isStacked && <MenuButton id={node.id} editing={editing} label="Condition options" />}
						<RemoveButton
							label="Remove condition"
							onClick={() => setRoot(removeNode(root, node.id))}
						/>
					</span>
				}
			/>
			{isMenuOpen && <MoveStrip id={node.id} editing={editing} label="condition" />}
		</div>
	);
};

const GroupItems: React.FC<{ group: DraftGroup; editing: Editing }> = ({ group, editing }) => (
	<div className="flex flex-col gap-2">
		{group.items.map((node, index) => (
			<div key={node.id} className="flex flex-col gap-2">
				<DropLine editing={editing} groupId={group.id} index={index} />
				<NodeView node={node} group={group} index={index} editing={editing} />
			</div>
		))}
		<DropLine editing={editing} groupId={group.id} index={group.items.length} />
	</div>
);

/** Counted a moment after the last edit, so typing a number does not re-filter on every key. */
function useLiveCount(root: DraftGroup, items: ReturnType<typeof useShelfLibrary>["items"]) {
	const now = useLocalDayNow();
	const [counted, setCounted] = useState(root);
	useEffect(() => {
		const timer = setTimeout(() => setCounted(root), COUNT_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [root]);
	return useMemo(() => {
		const tree = fromDraft(counted);
		return items.filter((item) => matchesTree(item.facets, tree.root, now)).length;
	}, [counted, items, now]);
}

const EditorForm: React.FC<Omit<Props, "open"> & { isStacked: boolean; onDone: () => void }> = ({
	shelf,
	initialTree,
	isStacked,
	onOpenChange,
	onDone,
}) => {
	const [name, setName] = useState(shelf?.name ?? "");
	const [root, setRootState] = useState(() => {
		const draft = toDraft(initialTree?.root ?? shelf?.tree?.root ?? EMPTY_ROOT);
		// A new shelf opens on one row to fill in rather than on an empty page.
		return !shelf && draft.items.length === 0 ? { ...draft, items: [newCondition()] } : draft;
	});
	const [menuFor, setMenuFor] = useState<string | null>(null);
	const [dragId, setDragId] = useState<string | null>(null);
	const [dropAt, setDropAt] = useState<DropAt | null>(null);
	const { items, options } = useShelfLibrary();
	const update = queryHooks.useUpdateSmartShelf();
	const create = queryHooks.useCreateSmartShelf();
	const navigate = useNavigate();
	const count = useLiveCount(root, items);
	const nameId = useId();

	const tree = useMemo(() => fromDraft(root), [root]);
	const conditions = serializeTree(tree);
	const isTooLarge = conditions.length > SMART_SHELF_CONDITIONS_MAX;
	const isComplete = isDraftComplete(root);
	const trimmed = name.trim();
	const isPending = update.isPending || create.isPending;
	const canSave = trimmed !== "" && isComplete && !isTooLarge && !isPending;

	const editing: Editing = {
		root,
		setRoot: setRootState,
		options,
		isStacked,
		menuFor,
		toggleMenu: (id) => setMenuFor((open) => (open === id ? null : id)),
		drag: {
			id: dragId,
			dropAt,
			start: (id) => {
				setMenuFor(null);
				setDragId(id);
			},
			over: (at) =>
				setDropAt((current) =>
					current?.groupId === at.groupId && current.index === at.index ? current : at,
				),
			drop: () => {
				if (dragId && dropAt) setRootState(moveNode(root, dragId, dropAt.groupId, dropAt.index));
				setDragId(null);
				setDropAt(null);
			},
			end: () => {
				setDragId(null);
				setDropAt(null);
			},
		},
	};

	const save = () => {
		if (!canSave) return;
		const filter = treeToFilter(tree);
		const show = (id: string) => {
			onDone();
			navigate({
				to: "/tabs/library",
				search: { shelf: id, f: filter ? encodeFilterParam(filter) : undefined },
			});
		};
		if (shelf) {
			update.mutate(
				{ id: shelf.id, name: trimmed, conditions },
				{ onSuccess: () => show(shelf.id) },
			);
		} else {
			create.mutate(
				{ name: trimmed, conditions, pinned: true },
				{ onSuccess: (row) => show(row.id) },
			);
		}
	};

	const countLabel = `${count} ${count === 1 ? "book matches" : "books match"}`;
	const hint = isTooLarge
		? "Too many conditions to save."
		: hasEmptyGroup(root)
			? "Add a condition to every group, or remove the empty group, to save."
			: !isComplete
				? "Give every condition a value to save."
				: trimmed === ""
					? "Name the shelf to save it."
					: null;

	const body = (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1.5">
				<label htmlFor={nameId} className="text-muted-foreground text-xs">
					Shelf name
				</label>
				<Input
					id={nameId}
					autoFocus={!shelf}
					value={name}
					maxLength={SMART_SHELF_NAME_MAX}
					placeholder="Shelf name"
					onChange={(e) => setName(e.target.value)}
				/>
			</div>
			<div className="flex items-center gap-2 text-sm">
				<span className="text-muted-foreground">Match</span>
				<MatchSwitch op={root.op} onChange={(op) => setRootState(setGroupOp(root, root.id, op))} />
				<span className="text-muted-foreground">of the following</span>
			</div>
			<GroupItems group={root} editing={editing} />
			{root.items.length === 0 && (
				<p className="m-0 text-muted-foreground text-sm">
					No conditions yet: the shelf holds every book.
				</p>
			)}
			<GroupTools group={root} editing={editing} />
		</div>
	);

	const keyboard = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			save();
		}
	};

	if (isStacked) {
		return (
			<div className="flex min-h-0 flex-1 flex-col" onKeyDown={keyboard}>
				<SheetHeaderBar
					title={<DrawerTitle className="truncate">{trimmed || "New smart shelf"}</DrawerTitle>}
					subtitle={<DrawerDescription>Edit conditions</DrawerDescription>}
					action={
						<>
							<SheetDoneButton
								className="font-medium text-muted-foreground"
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</SheetDoneButton>
							<SheetDoneButton disabled={!canSave} onClick={save}>
								Save
							</SheetDoneButton>
						</>
					}
				/>
				<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3" data-vaul-no-drag>
					{body}
				</div>
				<div className="flex flex-col gap-1.5 border-border border-t p-3">
					{hint && <p className="m-0 text-center text-muted-foreground text-xs">{hint}</p>}
					<Button type="button" disabled={!canSave} onClick={save} data-testid="shelf-live-count">
						Show {count} {count === 1 ? "book" : "books"}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-col gap-4" onKeyDown={keyboard}>
			<DialogHeader className="flex-row items-start gap-4 pr-8">
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<DialogTitle>{shelf ? "Edit conditions" : "New smart shelf"}</DialogTitle>
					<DialogDescription>
						Books matching these conditions appear on the shelf.
					</DialogDescription>
				</div>
				<span
					className="flex shrink-0 items-center gap-1.5 pt-0.5 text-muted-foreground text-xs"
					data-testid="shelf-live-count"
					aria-live="polite"
				>
					<span aria-hidden className="size-1.5 rounded-full bg-primary" />
					{countLabel} · live
				</span>
			</DialogHeader>
			<div className="-mx-1 min-h-0 overflow-y-auto px-1 py-1">{body}</div>
			<div className="flex items-center gap-2">
				<span className="flex-1 text-muted-foreground text-xs">{hint}</span>
				<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
					Cancel
				</Button>
				<Button type="button" disabled={!canSave} onClick={save}>
					Save
					<kbd className="ml-1 font-sans text-[0.7rem] opacity-70">Ctrl Enter</kbd>
				</Button>
			</div>
		</div>
	);
};

/**
 * The smart shelf condition editor: rows of field, operator and value in
 * groups that match all or any and nest. A dialog on wide web; a full-height
 * sheet in the app and on narrow web, where rows move by menu instead of drag.
 * Nothing is written until Save.
 */
export const ShelfConditionEditor: React.FC<Props> = ({ open, onOpenChange, ...props }) => {
	const isWideWeb = useMediaQuery("(min-width: 768px)") && !Capacitor.isNativePlatform();
	const close = () => onOpenChange(false);

	if (isWideWeb) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="max-h-[90vh] grid-rows-[minmax(0,1fr)] sm:max-w-[780px]">
					<EditorForm {...props} onOpenChange={onOpenChange} onDone={close} isStacked={false} />
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="h-[85vh]">
				<EditorForm {...props} onOpenChange={onOpenChange} onDone={close} isStacked />
			</DrawerContent>
		</Drawer>
	);
};
