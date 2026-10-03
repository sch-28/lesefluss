import type React from "react";
import { ThemeCards } from "../../../components/appearance-pickers";
import { useTheme } from "../../../contexts/theme-context";

const ThemeStep: React.FC = () => {
	const { theme, setTheme } = useTheme();

	return (
		<div>
			<h2 className="font-semibold text-2xl tracking-tight">Pick a theme</h2>
			<p className="mt-2 text-muted-foreground">Tap to preview — change any time in Settings.</p>

			<div className="mt-8">
				<ThemeCards value={theme} onChange={setTheme} />
			</div>
		</div>
	);
};

export default ThemeStep;
