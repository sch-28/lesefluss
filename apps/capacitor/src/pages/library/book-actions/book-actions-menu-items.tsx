import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { cn } from "@lesefluss/ui/utils";
import { Check } from "lucide-react";
import type React from "react";
import { Fragment } from "react";
import { isDangerAction, statusChoices } from "./book-action-items";
import { RatingInput } from "./rating-input";
import type { BookActionEntry } from "./use-book-actions";

/** The book menu inside a dropdown, with Set status and Rate as submenus. */
export const BookActionsMenuItems: React.FC<{
	entries: BookActionEntry[];
	itemClassName: string;
}> = ({ entries, itemClassName }) => (
	<>
		{entries.map((entry, i) => {
			const Icon = entry.icon;
			if (entry.kind === "item") {
				const startsDanger =
					i > 0 && isDangerAction(entry.id) && !isDangerAction(entries[i - 1]?.id ?? "");
				return (
					<Fragment key={entry.id}>
						{startsDanger && <DropdownMenuSeparator />}
						<DropdownMenuItem
							className={cn(itemClassName, entry.destructive && "text-destructive")}
							disabled={entry.disabled}
							// After the menu has closed, so a dialog it opens does not inherit
							// the menu's pointer-events lock on <body>.
							onSelect={() => setTimeout(entry.onSelect, 0)}
						>
							<Icon />
							<span>{entry.label}</span>
						</DropdownMenuItem>
					</Fragment>
				);
			}
			return (
				<DropdownMenuSub key={entry.id}>
					<DropdownMenuSubTrigger className={itemClassName}>
						<Icon />
						<span>{entry.label}</span>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-60 p-1.5">
						{entry.kind === "status" ? (
							statusChoices(entry.stored, entry.automatic).map((choice) => (
								<DropdownMenuItem
									key={choice.label}
									className={itemClassName}
									onSelect={() => entry.onPick(choice.status)}
								>
									<span className="flex-1">{choice.label}</span>
									{choice.isCurrent && <Check className="text-primary" />}
								</DropdownMenuItem>
							))
						) : (
							<>
								<div className="px-1 py-2">
									<RatingInput rating={entry.rating} onRate={entry.onRate} />
								</div>
								<DropdownMenuItem
									className={itemClassName}
									disabled={entry.rating === null}
									onSelect={() => entry.onRate(null)}
								>
									No rating
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			);
		})}
	</>
);
