import type React from "react";
import { ToggleRow } from "../../../components/app-shell/toggle-row";
import { ThemeCards } from "../../../components/appearance-pickers";
import { useTheme } from "../../../contexts/theme-context";
import { useAppearanceSettings } from "../../../hooks/use-appearance-settings";

const ThemeStep: React.FC = () => {
	const { storedTheme, isEinkMode, setTheme } = useTheme();
	const { setEinkMode } = useAppearanceSettings();

	return (
		<div>
			<h2 className="font-semibold text-2xl tracking-tight">Pick a theme</h2>
			<p className="mt-2 text-muted-foreground">Tap to preview — change any time in Settings.</p>

			<div className="mt-8">
				<ThemeCards value={storedTheme} onChange={setTheme} disabled={isEinkMode} />
			</div>

			<div className="mt-6 rounded-lg border border-border">
				<ToggleRow
					id="onboarding-eink-mode"
					title="E-ink display"
					subtitle="Reading on an e-reader? No animations, black on white, pages turn instantly."
					checked={isEinkMode}
					onCheckedChange={setEinkMode}
				/>
			</div>
		</div>
	);
};

export default ThemeStep;
