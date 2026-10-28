import { cn } from "@lesefluss/ui/utils";
import type { AppTheme } from "../contexts/theme-context";
import { FONT_FAMILIES, THEMES } from "../hooks/use-appearance-settings";

const SWATCH_BG: Record<AppTheme, string> = {
	light: "bg-white text-zinc-900 border-zinc-200",
	dark: "bg-zinc-900 text-zinc-100 border-zinc-700",
	sepia: "bg-[#c4b081] text-[#3a2e1e] border-[#8a7760]",
	"high-contrast": "bg-black text-white border-[#ffd60a]",
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
		// Four across, two by two where four would be too narrow, or one column once a large
		// font scale leaves a card too narrow for its swatch: never a ragged last row.
		<div className="@container w-full">
			<div className="grid @max-[12rem]:grid-cols-1 @max-[28rem]:grid-cols-2 grid-cols-4 gap-3">
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
					aria-label={f.name}
					className={cn(
						cardClass(value === f.value),
						"min-w-0 gap-1 [&:last-child:nth-child(odd)]:col-span-2",
					)}
				>
					<span className="font-semibold text-2xl text-foreground" style={{ fontFamily: f.stack }}>
						Aa
					</span>
					<span className="wrap-anywhere max-w-full font-medium text-foreground text-sm">
						{f.label}
					</span>
				</button>
			))}
		</div>
	);
}
