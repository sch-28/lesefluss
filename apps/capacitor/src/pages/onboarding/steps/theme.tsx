import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { useTheme } from "../../../contexts/theme-context";
import { THEMES } from "../../../hooks/use-appearance-settings";

const SWATCH_BG: Record<string, string> = {
	light: "bg-white text-zinc-900 border-zinc-200",
	dark: "bg-zinc-900 text-zinc-100 border-zinc-700",
	sepia: "bg-[#c4b081] text-[#3a2e1e] border-[#8a7760]",
};

const ThemeStep: React.FC = () => {
	const { theme, setTheme } = useTheme();

	return (
		<div>
			<h2 className="font-semibold text-2xl tracking-tight">Pick a theme</h2>
			<p className="mt-2 text-muted-foreground">Tap to preview — change any time in Settings.</p>

			<div className="mt-8 grid grid-cols-3 gap-3">
				{THEMES.map((t) => (
					<button
						key={t.value}
						type="button"
						onClick={() => setTheme(t.value)}
						className={cn(
							"flex flex-col items-center gap-3 rounded-lg border-2 p-4 transition-colors",
							theme === t.value
								? "border-primary bg-primary/5"
								: "border-border bg-card hover:border-muted-foreground/30",
						)}
					>
						<span
							className={cn(
								"flex size-14 items-center justify-center rounded-md border font-semibold text-2xl",
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
};

export default ThemeStep;
