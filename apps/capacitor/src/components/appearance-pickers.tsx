import { cn } from "@lesefluss/ui/utils";
import type { AppTheme } from "../contexts/theme-context";
import { FONT_FAMILIES, THEMES } from "../hooks/use-appearance-settings";

const SWATCH_BG: Record<AppTheme, string> = {
	light: "bg-white text-zinc-900 border-zinc-200",
	dark: "bg-zinc-900 text-zinc-100 border-zinc-700",
	sepia: "bg-[#c4b081] text-[#3a2e1e] border-[#8a7760]",
};

const cardClass = (isActive: boolean) =>
	cn(
		"flex flex-col items-center rounded-lg border-2 p-3 transition-colors",
		isActive
			? "border-primary bg-primary/5"
			: "border-border bg-card hover:border-muted-foreground/30",
	);

export function ThemeCards({
	value,
	onChange,
	disabled = false,
}: {
	value: AppTheme;
	onChange: (theme: AppTheme) => void;
	disabled?: boolean;
}) {
	return (
		<div className="grid w-full grid-cols-3 gap-3">
			{THEMES.map((t) => (
				<button
					key={t.value}
					type="button"
					onClick={() => onChange(t.value)}
					aria-pressed={value === t.value}
					disabled={disabled}
					className={cn(cardClass(value === t.value), "gap-2", disabled && "opacity-50")}
				>
					<span
						className={cn(
							"flex size-12 items-center justify-center rounded-md border font-semibold text-xl",
							SWATCH_BG[t.value],
						)}
					>
						Aa
					</span>
					<span className="font-medium text-foreground text-sm">{t.label}</span>
				</button>
			))}
		</div>
	);
}

export function FontCards({
	value,
	onChange,
}: {
	value: string;
	onChange: (font: string) => void;
}) {
	return (
		<div className="grid w-full grid-cols-2 gap-3">
			{FONT_FAMILIES.map((f) => (
				<button
					key={f.value}
					type="button"
					onClick={() => onChange(f.value)}
					aria-pressed={value === f.value}
					className={cn(cardClass(value === f.value), "gap-1")}
				>
					<span className="font-semibold text-2xl text-foreground" style={f.style}>
						Aa
					</span>
					<span className="font-medium text-foreground text-sm">{f.label}</span>
				</button>
			))}
		</div>
	);
}
