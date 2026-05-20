import { useRouter } from "@tanstack/react-router";
import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { useCallback, useState } from "react";
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
	/** Step renders its own footer/CTA. Shared Next/Back is hidden. */
	ownsFooter: boolean;
}

const Onboarding: React.FC = () => {
	const router = useRouter();
	const { settings, updateSetting, flush } = useAutoSaveSettings();
	const [step, setStep] = useState(0);
	const [importing, setImporting] = useState(false);

	const finish = useCallback(async () => {
		updateSetting("onboardingCompleted", true);
		await flush();
		router.navigate({ to: "/tabs/library", replace: true });
	}, [updateSetting, flush, router]);

	const next = useCallback(() => {
		setStep((s) => s + 1);
	}, []);

	const back = useCallback(() => {
		setStep((s) => Math.max(0, s - 1));
	}, []);

	// Pagination-style step is only relevant when user picks the standard reader.
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
		<div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-foreground">
			<div className="flex h-12 items-center justify-end px-4">
				{canSkip && (
					<Button variant="ghost" size="sm" onClick={finish} aria-label="Skip onboarding">
						Skip
					</Button>
				)}
			</div>

			<main className="flex flex-1 flex-col overflow-y-auto px-6 pb-8">
				<div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
					{steps[step]?.node}
				</div>
			</main>

			{step > 0 && (
				<div className="flex flex-col gap-3 border-border border-t bg-background/95 px-6 py-4 backdrop-blur">
					<div className="flex items-center justify-center gap-1.5" aria-hidden>
						{Array.from({ length: dotCount }).map((_, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: decorative dots
								key={i}
								className={cn(
									"size-1.5 rounded-full transition-colors",
									i === step - 1 ? "bg-primary" : "bg-muted-foreground/30",
								)}
							/>
						))}
					</div>
					{showFooter && (
						<div className="flex items-center justify-between gap-3">
							<Button variant="ghost" onClick={back}>
								Back
							</Button>
							<Button onClick={next}>Next</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default Onboarding;
