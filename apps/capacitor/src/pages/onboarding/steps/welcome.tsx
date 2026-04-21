import type React from "react";

interface Props {
	onNext: () => void;
	onSkip: () => void;
}

const WelcomeStep: React.FC<Props> = ({ onNext, onSkip }) => {
	return (
		<div className="onboarding-step onboarding-step--welcome">
			<div className="onboarding-brand">
				<h1 className="onboarding-title">Lesefluss</h1>
				<p className="onboarding-tagline">Read faster, one word at a time.</p>
			</div>
			<p className="onboarding-body">
				Welcome. Let's set up a few things so your first read feels right. It only takes a moment.
			</p>
			<div className="onboarding-actions">
				<button type="button" className="onboarding-btn onboarding-btn--primary" onClick={onNext}>
					Get started
				</button>
				<button type="button" className="onboarding-btn onboarding-btn--ghost" onClick={onSkip}>
					Skip
				</button>
			</div>
		</div>
	);
};

export default WelcomeStep;
