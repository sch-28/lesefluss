import { Switch } from "@lesefluss/ui/switch";
import { useId } from "react";

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
		<label
			htmlFor={switchId}
			className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-2"
		>
			<span className="flex min-w-0 flex-col">
				<span className="text-foreground text-sm">{title}</span>
				{subtitle && <span className="text-muted-foreground text-xs">{subtitle}</span>}
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
