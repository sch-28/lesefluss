import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { cn } from "@lesefluss/ui/utils";
import { Check } from "lucide-react";
import type React from "react";
import { statusChoices } from "./book-action-items";
import { RatingInput } from "./rating-input";
import type { BookActionEntry } from "./use-book-actions";

/** The book menu inside a dropdown, with Set status and Rate as submenus. */
export const BookActionsMenuItems: React.FC<{
	entries: BookActionEntry[];
	itemClassName: string;
}> = ({ entries, itemClassName }) => (
	<>
		{entries.map((entry) => {
			const Icon = entry.icon;
			if (entry.kind === "item") {
				return (
					<DropdownMenuItem
						key={entry.id}
						className={cn(itemClassName, entry.destructive && "text-destructive")}
						disabled={entry.disabled}
						onSelect={entry.onSelect}
					>
						<Icon />
						<span>{entry.label}</span>
					</DropdownMenuItem>
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
