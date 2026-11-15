import type React from "react";
import { SpeedTest } from "../../../components/speed-test/speed-test";
import { useOnboardingFooter } from "../footer-context";

/** The speed test; skipping it moves on and keeps the dial as it is. */
const SpeedStep: React.FC = () => {
	const { next, setFooter } = useOnboardingFooter();
	return (
		<SpeedTest
			onActions={setFooter}
			onSkip={next}
			onFinish={next}
			skipLabel="Skip this step"
			finishLabel="Continue"
			applyDialOnFinish
		/>
	);
};

export default SpeedStep;
