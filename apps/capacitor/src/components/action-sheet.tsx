import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { cn } from "@lesefluss/ui/utils";
import type { LucideIcon } from "lucide-react";
import type React from "react";

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

export const ActionSheet: React.FC<ActionSheetProps> = ({ open, onOpenChange, title, items }) => {
	const handleSelect = (item: ActionSheetItem) => {
		if (item.disabled) return;
		onOpenChange(false);
		item.onSelect();
	};
	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				{title && (
					<DrawerHeader className="border-border border-b">
						<DrawerTitle className="truncate text-center">{title}</DrawerTitle>
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
