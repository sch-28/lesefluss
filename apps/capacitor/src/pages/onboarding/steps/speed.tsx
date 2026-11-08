import type React from "react";
import { useState } from "react";
import { RsvpSpeedControl } from "../../../components/rsvp-speed-control";
import { SpeedTest } from "../../../components/speed-test/speed-test";
import { useAutoSaveSettings } from "../../../hooks/use-auto-save-settings";
import RsvpPreview from "../../settings/rsvp-preview";
import { useOnboardingFooter } from "../footer-context";

/** The speed test; skipping it leaves the dial to be picked by hand. */
const SpeedStep: React.FC = () => {
	const { next, setFooter } = useOnboardingFooter();
	const [manual, setManual] = useState(false);
	if (manual) return <ManualSpeed />;
	return (
		<SpeedTest
			onActions={setFooter}
			onSkip={() => {
				setFooter(null);
				setManual(true);
			}}
			onFinish={next}
			skipLabel="Skip this step"
			finishLabel="Continue"
		/>
	);
};

const ManualSpeed: React.FC = () => {
	const { settings, updateSetting } = useAutoSaveSettings();
	if (!settings) return null;

	return (
		<div>
			<h2 className="font-semibold text-2xl tracking-tight">Reading speed</h2>
			<p className="mt-2 text-muted-foreground">
				Words flash one at a time. Find a pace that feels brisk but readable.
			</p>

			<div className="mt-6">
				<RsvpPreview settings={settings} />
			</div>

			<div className="mt-6 flex justify-center">
				<RsvpSpeedControl
					wpm={settings.wpm}
					onChange={(wpm) => updateSetting("wpm", wpm)}
					className="text-2xl"
				/>
			</div>
		</div>
	);
};

export default SpeedStep;
