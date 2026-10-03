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
		<div className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
			<label htmlFor={switchId} className="flex min-w-0 flex-col">
				<span className="text-foreground text-sm">{title}</span>
				{subtitle && <span className="text-muted-foreground text-xs">{subtitle}</span>}
			</label>
			<Switch
				id={switchId}
				checked={checked}
				disabled={disabled}
				onCheckedChange={onCheckedChange}
				aria-label={title}
			/>
		</div>
	);
}
