import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { cn } from "@lesefluss/ui/utils";
import type { LucideIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { FINE_POINTER_QUERY, useMediaQuery } from "../hooks/use-media-query";

export interface ActionSheetItem {
	label: string;
	/** A second line under the label. */
	hint?: string;
	icon?: LucideIcon;
	onSelect: () => void;
	destructive?: boolean;
	disabled?: boolean;
}

export interface ActionSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title?: string;
	items: ActionSheetItem[];
}

/** On touch, a list this short is a menu at the finger, not a sheet (LESE-185.14 overlay rule).
 *  A mouse always gets the menu, whatever the count (LESE-211.8). */
export const ANCHORED_MAX_ITEMS = 6;
/** A press older than this did not open the sheet (a keyboard or programmatic open did). */
const ANCHOR_MAX_AGE_MS = 1500;
/** A control at most this big is a trigger the menu hangs from; a bigger one (a card) is not. */
const TRIGGER_MAX = { width: 240, height: 64 };

/** Where a menu hangs, in viewport px: a trigger's box, or a zero-size press point. */
export type Anchor = { x: number; y: number; width: number; height: number };

type Press = { x: number | null; y: number | null; at: number; target: EventTarget | null };
let lastPress: Press | null = null;

if (typeof window !== "undefined") {
	window.addEventListener(
		"pointerdown",
		(e) => {
			lastPress = { x: e.clientX, y: e.clientY, at: Date.now(), target: e.target };
		},
		{ capture: true, passive: true },
	);
	// A keyboard or scripted click has no pointerdown before it, but still names its trigger.
	window.addEventListener(
		"click",
		(e) => {
			const fromPress = lastPress && lastPress.target === e.target && isRecent(lastPress);
			if (fromPress) return;
			const isPointer = e.detail > 0;
			lastPress = {
				x: isPointer ? e.clientX : null,
				y: isPointer ? e.clientY : null,
				at: Date.now(),
				target: e.target,
			};
		},
		{ capture: true, passive: true },
	);
}

/** Destructive items form their own group after the working ones; a rule sets it apart. */
function startsDangerGroup(items: readonly ActionSheetItem[], index: number): boolean {
	return !!items[index].destructive && index > 0 && !items[index - 1].destructive;
}

function isRecent(press: Press): boolean {
	return Date.now() - press.at <= ANCHOR_MAX_AGE_MS;
}

function boxOf(el: Element): Anchor | null {
	if (!el.isConnected) return null;
	const rect = el.getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0) return null;
	return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function triggerBox(target: EventTarget | null): Anchor | null {
	if (!(target instanceof Element)) return null;
	const control = target.closest("button, [role='button'], a");
	const box = control && boxOf(control);
	if (!box || box.width > TRIGGER_MAX.width || box.height > TRIGGER_MAX.height) return null;
	return box;
}

function recentAnchor(): Anchor | null {
	if (!lastPress || !isRecent(lastPress)) return null;
	const trigger = triggerBox(lastPress.target);
	if (trigger) return trigger;
	if (lastPress.x === null || lastPress.y === null) return null;
	return { x: lastPress.x, y: lastPress.y, width: 0, height: 0 };
}

function focusedTrigger(): Anchor | null {
	const el = document.activeElement;
	if (!(el instanceof HTMLElement) || el === document.body) return null;
	return boxOf(el);
}

/** Where a menu opened by `open` should sit: the trigger or press that opened it, or on a
 *  fine pointer the focused trigger. Null means no anchor (show a sheet). */
export function useOpenAnchor(open: boolean): { anchor: Anchor | null; isFinePointer: boolean } {
	const isFinePointer = useMediaQuery(FINE_POINTER_QUERY);
	// Captured once per opening so the menu does not jump when a later tap lands.
	const [anchor, setAnchor] = useState<Anchor | null>(null);
	const [openedFor, setOpenedFor] = useState(false);
	if (open !== openedFor) {
		setOpenedFor(open);
		if (open) setAnchor(recentAnchor() ?? (isFinePointer ? focusedTrigger() : null));
	}
	return { anchor, isFinePointer };
}

/** The menu content's placement for an anchor: below a trigger, lined up with whichever of
 *  its edges faces the middle of the screen; a press point keeps a finger's gap. */
export function anchorPlacement(anchor: Anchor): { align: "start" | "end"; sideOffset: number } {
	if (anchor.width === 0) return { align: "start", sideOffset: 12 };
	const isRightHalf = anchor.x + anchor.width / 2 > window.innerWidth / 2;
	return { align: isRightHalf ? "end" : "start", sideOffset: 4 };
}

/** An invisible trigger over the anchor, for a DropdownMenu opened from elsewhere. Portalled to
 *  <body>: a fixed box inside a blurred or transformed header would be placed against that
 *  header instead of the viewport. */
export const AnchorPoint: React.FC<{ anchor: Anchor }> = ({ anchor }) =>
	createPortal(
		<DropdownMenuTrigger asChild>
			<span
				aria-hidden
				tabIndex={-1}
				className="pointer-events-none fixed"
				style={{ left: anchor.x, top: anchor.y, width: anchor.width, height: anchor.height }}
			/>
		</DropdownMenuTrigger>,
		document.body,
	);

export const ActionSheet: React.FC<ActionSheetProps> = (props) => {
	const { open, items } = props;
	const { anchor, isFinePointer } = useOpenAnchor(open);
	if (anchor && (isFinePointer || items.length <= ANCHORED_MAX_ITEMS)) {
		return <AnchoredActionMenu {...props} anchor={anchor} />;
	}
	return <ActionDrawer {...props} />;
};

const AnchoredActionMenu: React.FC<ActionSheetProps & { anchor: Anchor }> = ({
	open,
	onOpenChange,
	title,
	items,
	anchor,
}) => (
	<DropdownMenu open={open} onOpenChange={onOpenChange} modal>
		<AnchorPoint anchor={anchor} />
		<DropdownMenuContent
			data-testid="action-menu"
			{...anchorPlacement(anchor)}
			className="w-auto min-w-48 max-w-[calc(100vw-2rem)]"
			// The trigger is an invisible point; focus goes back to the page instead.
			onCloseAutoFocus={(e) => e.preventDefault()}
		>
			{title && (
				<>
					<DropdownMenuLabel className="max-w-64 truncate">{title}</DropdownMenuLabel>
					<DropdownMenuSeparator />
				</>
			)}
			{items.map((item, i) => {
				const Icon = item.icon;
				return [
					startsDangerGroup(items, i) && <DropdownMenuSeparator key={`${item.label}-rule`} />,
					<DropdownMenuItem
						key={item.label}
						disabled={item.disabled}
						variant={item.destructive ? "destructive" : "default"}
						// Runs after the menu has closed, so a dialog it opens does not inherit
						// the menu's pointer-events lock on <body>.
						onSelect={() => setTimeout(item.onSelect, 0)}
					>
						{Icon && <Icon className="size-4" />}
						<ItemText item={item} />
					</DropdownMenuItem>,
				];
			})}
		</DropdownMenuContent>
	</DropdownMenu>
);

const ActionDrawer: React.FC<ActionSheetProps> = ({ open, onOpenChange, title, items }) => {
	const handleSelect = (item: ActionSheetItem) => {
		if (item.disabled) return;
		onOpenChange(false);
		item.onSelect();
	};
	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				{title && (
					<DrawerHeader>
						<DrawerTitle className="truncate">{title}</DrawerTitle>
					</DrawerHeader>
				)}
				<div className="flex flex-col p-2">
					{items.map((item, i) => {
						const Icon = item.icon;
						return [
							startsDangerGroup(items, i) && (
								<hr key={`${item.label}-rule`} className="my-1 border-border border-t" />
							),
							<button
								key={item.label}
								type="button"
								disabled={item.disabled}
								onClick={() => handleSelect(item)}
								className={cn(
									"flex min-h-12 items-center gap-3 rounded-md px-3 py-2 text-left text-base transition-colors hover:bg-muted disabled:opacity-50",
									item.destructive ? "text-destructive" : "text-foreground",
								)}
							>
								{Icon && <Icon className="size-5 shrink-0" />}
								<ItemText item={item} />
							</button>,
						];
					})}
				</div>
			</DrawerContent>
		</Drawer>
	);
};

const ItemText: React.FC<{ item: ActionSheetItem }> = ({ item }) =>
	item.hint ? (
		<span className="flex min-w-0 flex-1 flex-col">
			<span className="truncate">{item.label}</span>
			<span className="truncate text-muted-foreground text-sm">{item.hint}</span>
		</span>
	) : (
		<span className="flex-1 truncate">{item.label}</span>
	);
