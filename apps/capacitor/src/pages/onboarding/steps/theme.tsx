import type React from "react";
import { ToggleRow } from "../../../components/app-shell/toggle-row";
import { ThemeCards } from "../../../components/appearance-pickers";
import { useTheme } from "../../../contexts/theme-context";
import { useAppearanceSettings } from "../../../hooks/use-appearance-settings";
import { StepHeader } from "../step-header";

const ThemeStep: React.FC = () => {
	const { storedTheme, isEinkMode, setTheme } = useTheme();
	const { setEinkMode } = useAppearanceSettings();

	return (
		<div>
			<StepHeader
				title="Pick a theme"
				description="Tap to preview. Change it any time in Settings."
			/>

			<div className="mt-6">
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
