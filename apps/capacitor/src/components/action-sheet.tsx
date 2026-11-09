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

export interface ActionSheetItem {
	label: string;
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

/** A list this short is a menu at the finger, not a sheet (LESE-185.14 overlay rule). */
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

function recentPress(): Point | null {
	if (!lastPress || Date.now() - lastPress.at > ANCHOR_MAX_AGE_MS) return null;
	return lastPress;
}

export const ActionSheet: React.FC<ActionSheetProps> = (props) => {
	const { open, items } = props;
	// Captured once per opening so the menu does not jump when a later tap lands.
	const [anchor, setAnchor] = useState<Point | null>(null);
	const [openedFor, setOpenedFor] = useState(false);
	if (open !== openedFor) {
		setOpenedFor(open);
		if (open) setAnchor(recentPress());
	}
	if (anchor && items.length <= ANCHORED_MAX_ITEMS) {
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
		<DropdownMenuTrigger asChild>
			<span
				aria-hidden
				tabIndex={-1}
				className="pointer-events-none fixed size-0"
				style={{ left: anchor.x, top: anchor.y }}
			/>
		</DropdownMenuTrigger>
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
			{items.map((item) => {
				const Icon = item.icon;
				return (
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
						<span className="flex-1 truncate">{item.label}</span>
					</DropdownMenuItem>
				);
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
					{items.map((item) => {
						const Icon = item.icon;
						return (
							<button
								key={item.label}
								type="button"
								disabled={item.disabled}
								onClick={() => handleSelect(item)}
								className={cn(
									"flex h-12 items-center gap-3 rounded-md px-3 text-left text-base transition-colors hover:bg-muted disabled:opacity-50",
									item.destructive ? "text-destructive" : "text-foreground",
								)}
							>
								{Icon && <Icon className="size-5 shrink-0" />}
								<span className="flex-1 truncate">{item.label}</span>
							</button>
						);
					})}
				</div>
			</DrawerContent>
		</Drawer>
	);
};
