import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { IconButton } from "@lesefluss/ui/icon-button";
import { MoreHorizontal } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { ActionSheet, type ActionSheetItem } from "../../components/action-sheet";
import { MenuKey } from "../../components/command-palette";
import { FINE_POINTER_QUERY, useMediaQuery } from "../../hooks/use-media-query";

export type ReaderMenuItem = ActionSheetItem & {
	/** The command whose shortcut the desktop menu shows beside the label. */
	commandId?: string;
	/** A rule above this item in the desktop menu. */
	separated?: boolean;
};

const TriggerContent: React.FC = () => (
	<>
		<MoreHorizontal />
		{/* Text, not aria-label alone: Android reads a menu button's text and drops its
		    aria-label, so TalkBack found it unnamed (TASK-205.13). */}
		<span className="sr-only">More actions</span>
	</>
);

/** The reader's ⋯: a menu at the button with a mouse, a bottom sheet on touch (LESE-211.27 d-2). */
export const ReaderMoreMenu: React.FC<{ title: string; items: ReaderMenuItem[] }> = ({
	title,
	items,
}) => {
	const isFinePointer = useMediaQuery(FINE_POINTER_QUERY);
	const [isSheetOpen, setSheetOpen] = useState(false);

	if (!isFinePointer) {
		return (
			<>
				<IconButton
					aria-label="More actions"
					title="More actions"
					aria-haspopup="menu"
					onClick={() => setSheetOpen(true)}
				>
					<TriggerContent />
				</IconButton>
				<ActionSheet open={isSheetOpen} onOpenChange={setSheetOpen} title={title} items={items} />
			</>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<IconButton aria-label="More actions" title="More actions">
					<TriggerContent />
				</IconButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-80 p-1.5">
				{items.map((item) => {
					const Icon = item.icon;
					return [
						item.separated && <DropdownMenuSeparator key={`${item.label}-rule`} />,
						<DropdownMenuItem
							key={item.label}
							className="gap-3 px-3"
							onSelect={item.onSelect}
							disabled={item.disabled}
						>
							{Icon && <Icon />}
							<span>{item.label}</span>
							{item.commandId && <MenuKey commandId={item.commandId} />}
						</DropdownMenuItem>,
					];
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
