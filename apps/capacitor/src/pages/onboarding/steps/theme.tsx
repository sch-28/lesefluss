import type React from "react";
import { useTheme } from "../../../contexts/theme-context";
import { THEMES } from "../../../hooks/use-appearance-settings";

const ThemeStep: React.FC = () => {
	const { theme, setTheme } = useTheme();

	return (
		<div className="onboarding-step">
			<h2 className="onboarding-step-title">Pick a theme</h2>
			<p className="onboarding-step-sub">Tap to preview — change any time in Settings.</p>
			<div className="onboarding-theme-grid">
				{THEMES.map((t) => (
					<button
						key={t.value}
						type="button"
						className={
							theme === t.value
								? "onboarding-theme-card onboarding-theme-card--active"
								: "onboarding-theme-card"
						}
						onClick={() => setTheme(t.value)}
					>
						<span className={`onboarding-theme-swatch onboarding-theme-swatch--${t.value}`}>
							Aa
						</span>
						<span className="onboarding-theme-label">{t.label}</span>
					</button>
				))}
			</div>
		</div>
	);
};

export default ThemeStep;
