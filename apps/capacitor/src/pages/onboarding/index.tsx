import { IonContent, IonPage } from "@ionic/react";
import type React from "react";
import { useCallback, useState } from "react";
import { useHistory } from "react-router-dom";
import { useAutoSaveSettings } from "../../hooks/use-auto-save-settings";
import BooksStep from "./steps/books";
import PaginationStyleStep from "./steps/pagination-style";
import ReaderModeStep from "./steps/reader-mode";
import SpeedStep from "./steps/speed";
import SyncStep from "./steps/sync";
import ThemeStep from "./steps/theme";
import WelcomeStep from "./steps/welcome";

interface StepEntry {
	node: React.ReactNode;
	/** Step renders its own footer/CTA — the shared Next/Back is hidden. */
	ownsFooter: boolean;
}

const Onboarding: React.FC = () => {
	const history = useHistory();
	const { settings, updateSetting, flush } = useAutoSaveSettings();
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
	// The pagination-style step is only relevant for users who pick the standard
	// reader (not RSVP) on the previous step.
	const showPaginationStep = !!settings && settings.defaultReaderMode !== "rsvp";
	const steps: StepEntry[] = [
		{ node: <WelcomeStep key="welcome" onNext={next} onSkip={finish} />, ownsFooter: true },
		{ node: <ThemeStep key="theme" />, ownsFooter: false },
		{ node: <SpeedStep key="speed" />, ownsFooter: false },
		{ node: <ReaderModeStep key="reader-mode" />, ownsFooter: false },
		...(showPaginationStep
			? [{ node: <PaginationStyleStep key="pagination-style" />, ownsFooter: false }]
			: []),
		{
			node: <BooksStep key="books" onNext={next} onImportingChange={setImporting} />,
			ownsFooter: true,
		},
		{ node: <SyncStep key="sync" onFinish={finish} />, ownsFooter: true },
	];
	const totalSteps = steps.length;
	const dotCount = totalSteps - 1;

	const ownsOwnFooter = steps[step]?.ownsFooter ?? false;
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

					<div className="onboarding-body-wrap">{steps[step]?.node}</div>

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
