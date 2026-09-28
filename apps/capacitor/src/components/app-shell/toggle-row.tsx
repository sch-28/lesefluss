import { Switch } from "@lesefluss/ui/switch";

export function ToggleRow({
	title,
	subtitle,
	checked,
	disabled,
	onCheckedChange,
}: {
	title: string;
	subtitle: string;
	checked: boolean;
	disabled?: boolean;
	onCheckedChange: (value: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-3 px-4 py-3">
			<div className="min-w-0">
				<div className="font-medium text-foreground text-sm">{title}</div>
				<div className="text-muted-foreground text-xs">{subtitle}</div>
			</div>
			<Switch
				checked={checked}
				disabled={disabled}
				onCheckedChange={onCheckedChange}
				aria-label={title}
			/>
		</div>
	);
}
