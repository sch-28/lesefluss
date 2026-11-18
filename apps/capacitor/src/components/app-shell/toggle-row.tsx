import { Switch } from "@lesefluss/ui/switch";
import { cn } from "@lesefluss/ui/utils";
import { useId } from "react";
import { LIST_ROW, LIST_ROW_LABEL, LIST_ROW_SUB } from "@/components/list-row";

export function ToggleRow({
	id,
	title,
	subtitle,
	checked,
	disabled,
	onCheckedChange,
}: {
	id?: string;
	title: string;
	subtitle?: string;
	checked: boolean;
	disabled?: boolean;
	onCheckedChange: (value: boolean) => void;
}) {
	const fallbackId = useId();
	const switchId = id ?? fallbackId;
	return (
		// The whole row is the label, so a tap anywhere on it flips the switch.
		<label htmlFor={switchId} className={cn(LIST_ROW, "cursor-pointer justify-between")}>
			<span className="flex min-w-0 flex-col">
				<span className={LIST_ROW_LABEL}>{title}</span>
				{subtitle && <span className={LIST_ROW_SUB}>{subtitle}</span>}
			</span>
			<Switch
				id={switchId}
				checked={checked}
				disabled={disabled}
				onCheckedChange={onCheckedChange}
				aria-label={title}
			/>
		</label>
	);
}
