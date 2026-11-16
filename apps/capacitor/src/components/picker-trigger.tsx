import { cn } from "@lesefluss/ui/utils";
import { ChevronDown } from "lucide-react";
import type React from "react";

type Props = Omit<React.ComponentProps<"button">, "value" | "children"> & {
	/** The picked value; null shows the placeholder in the muted colour. */
	value: React.ReactNode | null;
	placeholder: string;
	/** Before the chevron: a code, a "from file" chip. */
	trailing?: React.ReactNode;
};

/** The one look every picker field in a form shares: a field-sized box with a chevron. */
export const PickerTrigger: React.FC<Props> = ({
	value,
	placeholder,
	trailing,
	className,
	...props
}) => (
	<button
		type="button"
		{...props}
		className={cn(
			"flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-base md:text-sm dark:bg-input/30",
			className,
		)}
	>
		<span className={cn("min-w-0 flex-1 truncate", value === null && "text-muted-foreground")}>
			{value ?? placeholder}
		</span>
		{trailing}
		<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
	</button>
);
