import type React from "react";
import { ModeCards, READER_MODE_OPTIONS } from "../../../components/rsvp-pickers";
import { useAutoSaveSettings } from "../../../hooks/use-auto-save-settings";

const ReaderModeStep: React.FC = () => {
	const { settings, updateSetting } = useAutoSaveSettings();
	if (!settings) return null;

	return (
		<div>
			<h2 className="font-semibold text-2xl tracking-tight">Default reading mode</h2>
			<p className="mt-2 text-muted-foreground">Which view opens first when you tap a book?</p>
			<div className="mt-8">
				<ModeCards
					options={READER_MODE_OPTIONS}
					value={settings.defaultReaderMode}
					onChange={(mode) => updateSetting("defaultReaderMode", mode)}
				/>
			</div>
		</div>
	);
};

export default ReaderModeStep;
