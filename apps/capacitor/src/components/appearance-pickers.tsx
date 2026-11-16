import { cn } from "@lesefluss/ui/utils";
import type { AppTheme } from "../contexts/theme-context";
import { FONT_FAMILIES, THEMES } from "../hooks/use-appearance-settings";

const SWATCH_BG: Record<AppTheme, string> = {
	light: "bg-white text-zinc-900 border-zinc-200",
	dark: "bg-zinc-900 text-zinc-100 border-zinc-700",
	sepia: "bg-[#c4b081] text-[#3a2e1e] border-[#8a7760]",
	"high-contrast": "bg-black text-white border-[#ffd60a]",
};

const cardClass = (isActive: boolean, compact = false) =>
	cn(
		"flex flex-col items-center rounded-lg border-2 transition-colors",
		compact ? "p-1.5" : "p-3",
		isActive
			? "border-primary bg-primary/5"
			: "border-border bg-card hover:border-muted-foreground/30",
	);

export function ThemeCards({
	value,
	onChange,
	disabled = false,
	compact = false,
}: {
	value: AppTheme;
	onChange: (theme: AppTheme) => void;
	disabled?: boolean;
	/** The reader's Appearance popover: smaller cards, four across in its width. */
	compact?: boolean;
}) {
	return (
		// Four across, two by two where four would be too narrow, or one column once a large
		// font scale leaves a card too narrow for its swatch: never a ragged last row.
		<div className="@container w-full">
			<div
				className={cn(
					"grid @max-[12rem]:grid-cols-1 grid-cols-4",
					compact ? "@max-[16rem]:grid-cols-2 gap-1.5" : "@max-[28rem]:grid-cols-2 gap-3",
				)}
			>
				{THEMES.map((t) => (
					<button
						key={t.value}
						type="button"
						onClick={() => onChange(t.value)}
						aria-pressed={value === t.value}
						aria-label={t.label}
						disabled={disabled}
						className={cn(
							cardClass(value === t.value, compact),
							compact ? "min-w-0 gap-1" : "gap-2",
							disabled && "opacity-50",
						)}
					>
						<span
							className={cn(
								"flex items-center justify-center rounded-md border font-semibold",
								compact ? "size-8 text-sm" : "size-12 text-xl",
								SWATCH_BG[t.value],
							)}
						>
							Aa
						</span>
						<span
							className={cn(
								"wrap-anywhere max-w-full font-medium text-foreground",
								compact ? "text-xs" : "text-sm",
							)}
						>
							{compact ? (t.short ?? t.label) : t.label}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}

export function FontCards({
	value,
	onChange,
	compact = false,
}: {
	value: string;
	onChange: (font: string) => void;
	compact?: boolean;
}) {
	return (
		<div className={cn("grid w-full grid-cols-2", compact ? "gap-1.5" : "gap-3")}>
			{FONT_FAMILIES.map((f) => (
				<button
					key={f.value}
					type="button"
					onClick={() => onChange(f.value)}
					aria-pressed={value === f.value}
					aria-label={f.name}
					className={cn(
						cardClass(value === f.value, compact),
						"min-w-0 [&:last-child:nth-child(odd)]:col-span-2",
						compact ? "flex-row justify-center gap-2" : "gap-1",
					)}
				>
					<span
						className={cn("font-semibold text-foreground", compact ? "text-base" : "text-2xl")}
						style={{ fontFamily: f.stack }}
					>
						Aa
					</span>
					<span
						className={cn(
							"wrap-anywhere max-w-full font-medium text-foreground",
							compact ? "text-xs" : "text-sm",
						)}
					>
						{f.label}
					</span>
				</button>
			))}
		</div>
	);
}
