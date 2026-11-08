import { SPEED_WINDOWS, type SpeedWindow } from "@lesefluss/core";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { cn } from "@lesefluss/ui/utils";
import { Check, ChevronDown } from "lucide-react";
import { queryHooks } from "../services/db/hooks";
import { WINDOW_LABELS } from "./speed-chip/speed-chip-model";

/** Picks the span of sittings every speed and time estimate is drawn from. */
export function SpeedWindowSelect({ window }: { window: SpeedWindow }) {
	const save = queryHooks.useSaveSettings();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					data-testid="speed-window-select"
					aria-label={`Speed window: ${WINDOW_LABELS[window]}`}
					className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 text-sm hover:bg-muted"
				>
					{WINDOW_LABELS[window]} <ChevronDown className="size-3.5" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{SPEED_WINDOWS.map((w) => (
					<DropdownMenuItem
						key={w}
						onSelect={() => {
							if (w !== window) save.mutate({ speedWindow: w });
						}}
					>
						<Check className={cn("size-4", w === window ? "opacity-100" : "opacity-0")} />
						{WINDOW_LABELS[w]}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
