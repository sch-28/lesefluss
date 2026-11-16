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

type Point = { x: number; y: number; at: number };
let lastPress: Point | null = null;

if (typeof window !== "undefined") {
	window.addEventListener(
		"pointerdown",
		(e) => {
			lastPress = { x: e.clientX, y: e.clientY, at: Date.now() };
		},
		{ capture: true, passive: true },
	);
}

/** Destructive items form their own group after the working ones; a rule sets it apart. */
function startsDangerGroup(items: readonly ActionSheetItem[], index: number): boolean {
	return !!items[index].destructive && index > 0 && !items[index - 1].destructive;
}

function recentPress(): Point | null {
	if (!lastPress || Date.now() - lastPress.at > ANCHOR_MAX_AGE_MS) return null;
	return lastPress;
}

/** A keyboard open: just under the focused trigger, offset for the menu's finger gap. */
function focusedTrigger(): Point | null {
	const el = document.activeElement;
	if (!(el instanceof HTMLElement) || el === document.body) return null;
	const rect = el.getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0) return null;
	return { x: rect.left, y: rect.bottom - 8, at: Date.now() };
}

/** Where a menu opened by `open` should sit: the press that opened it, or on a fine
 *  pointer the focused trigger. Null means no anchor (show a sheet). */
export function useOpenAnchor(open: boolean): { anchor: Point | null; isFinePointer: boolean } {
	const isFinePointer = useMediaQuery(FINE_POINTER_QUERY);
	// Captured once per opening so the menu does not jump when a later tap lands.
	const [anchor, setAnchor] = useState<Point | null>(null);
	const [openedFor, setOpenedFor] = useState(false);
	if (open !== openedFor) {
		setOpenedFor(open);
		if (open) setAnchor(recentPress() ?? (isFinePointer ? focusedTrigger() : null));
	}
	return { anchor, isFinePointer };
}

/** An invisible trigger at a point, for a DropdownMenu opened from elsewhere. */
export const AnchorPoint: React.FC<{ anchor: Point }> = ({ anchor }) => (
	<DropdownMenuTrigger asChild>
		<span
			aria-hidden
			tabIndex={-1}
			className="pointer-events-none fixed size-0"
			style={{ left: anchor.x, top: anchor.y }}
		/>
	</DropdownMenuTrigger>
);

export const ActionSheet: React.FC<ActionSheetProps> = (props) => {
	const { open, items } = props;
	const { anchor, isFinePointer } = useOpenAnchor(open);
	if (anchor && (isFinePointer || items.length <= ANCHORED_MAX_ITEMS)) {
		return <AnchoredActionMenu {...props} anchor={anchor} />;
	}
	return <ActionDrawer {...props} />;
};

const AnchoredActionMenu: React.FC<ActionSheetProps & { anchor: Point }> = ({
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
			align="start"
			sideOffset={12}
			collisionPadding={8}
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
						className="py-2 text-base"
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
