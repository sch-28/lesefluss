import { IonContent, IonPage } from "@ionic/react";
import type React from "react";
import { useCallback, useState } from "react";
import { useHistory } from "react-router-dom";
import { useAutoSaveSettings } from "../../hooks/use-auto-save-settings";
import BooksStep from "./steps/books";
import ReaderModeStep from "./steps/reader-mode";
import SpeedStep from "./steps/speed";
import SyncStep from "./steps/sync";
import ThemeStep from "./steps/theme";
import WelcomeStep from "./steps/welcome";

const Onboarding: React.FC = () => {
	const history = useHistory();
	const { updateSetting, flush } = useAutoSaveSettings();
	const [step, setStep] = useState(0);
	const [importing, setImporting] = useState(false);

	const finish = useCallback(async () => {
		updateSetting("onboardingCompleted", true);
		await flush();
		history.replace("/tabs/library");
	}, [updateSetting, flush, history]);

	const next = useCallback(() => {
		setStep((s) => s + 1);
	}, []);

	const back = useCallback(() => {
		setStep((s) => Math.max(0, s - 1));
	}, []);

	// Step order — single source of truth for length and rendering.
	// Welcome (index 0) and Books (index 4) own their own CTAs; others use the footer Next.
	const steps: React.ReactNode[] = [
		<WelcomeStep key="welcome" onNext={() => setStep(1)} onSkip={finish} />,
		<ThemeStep key="theme" />,
		<SpeedStep key="speed" />,
		<ReaderModeStep key="reader-mode" />,
		<BooksStep key="books" onNext={next} onImportingChange={setImporting} />,
		<SyncStep key="sync" onFinish={finish} />,
	];
	const totalSteps = steps.length;
	const dotCount = totalSteps - 1;

	// Books step (index 4) and Welcome (0) own their own CTAs.
	const ownsOwnFooter = step === 0 || step === 4;
	const canSkip = step > 0 && step < totalSteps - 1 && !importing;
	const showFooter = canSkip && !ownsOwnFooter;

	return (
		<IonPage className="onboarding-page">
			<IonContent fullscreen>
				<div className="onboarding-container">
					<div className="onboarding-top-bar">
						{canSkip && (
							<button
								type="button"
								className="onboarding-skip"
								onClick={finish}
								aria-label="Skip onboarding"
							>
								Skip
							</button>
						)}
					</div>

					<div className="onboarding-body-wrap">{steps[step]}</div>

					{step > 0 && (
						<div className="onboarding-footer">
							<div className="onboarding-dots" aria-hidden>
								{Array.from({ length: dotCount }).map((_, i) => (
									<span
										// biome-ignore lint/suspicious/noArrayIndexKey: decorative dots
										key={i}
										className={
											i === step - 1 ? "onboarding-dot onboarding-dot--active" : "onboarding-dot"
										}
									/>
								))}
							</div>
							{showFooter && (
								<div className="onboarding-nav">
									<button
										type="button"
										className="onboarding-btn onboarding-btn--ghost"
										onClick={back}
									>
										Back
									</button>
									<button
										type="button"
										className="onboarding-btn onboarding-btn--primary"
										onClick={next}
									>
										Next
									</button>
								</div>
							)}
						</div>
					)}
				</div>
			</IonContent>
		</IonPage>
	);
};

export default Onboarding;
