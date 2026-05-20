import type React from "react";
import { ModeCards, PAGINATION_STYLE_OPTIONS } from "../../../components/rsvp-pickers";
import { useAutoSaveSettings } from "../../../hooks/use-auto-save-settings";

const PaginationStyleStep: React.FC = () => {
	const { settings, updateSetting } = useAutoSaveSettings();
	if (!settings) return null;

	return (
		<div>
			<h2 className="font-semibold text-2xl tracking-tight">Reading layout</h2>
			<p className="mt-2 text-muted-foreground">How would you like pages to flow?</p>
			<div className="mt-8">
				<ModeCards
					options={PAGINATION_STYLE_OPTIONS}
					value={settings.paginationStyle}
					onChange={(style) => updateSetting("paginationStyle", style)}
				/>
			</div>
		</div>
	);
};

export default PaginationStyleStep;
