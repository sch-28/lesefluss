import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useAutoSaveSettings } from "../../hooks/use-auto-save-settings";
import { type OnboardingFooter, OnboardingFooterContext } from "./footer-context";
import BooksStep from "./steps/books";
import PaginationStyleStep from "./steps/pagination-style";
import ReaderModeStep from "./steps/reader-mode";
import SpeedStep from "./steps/speed";
import SyncStep from "./steps/sync";
import ThemeStep from "./steps/theme";
import WelcomeStep from "./steps/welcome";

const Onboarding: React.FC = () => {
	const router = useRouter();
	const { settings, updateSetting, flush } = useAutoSaveSettings();
	const [step, setStep] = useState(0);
	const [footer, setFooter] = useState<OnboardingFooter | null>(null);

	const finish = useCallback(async () => {
		updateSetting("onboardingCompleted", true);
		await flush();
		router.navigate({ to: "/tabs/library", replace: true });
	}, [updateSetting, flush, router]);

	const next = useCallback(() => {
		setFooter(null);
		setStep((s) => s + 1);
	}, []);

	const back = useCallback(() => {
		setFooter(null);
		setStep((s) => Math.max(0, s - 1));
	}, []);

	const ctxValue = useMemo(() => ({ next, finish, setFooter }), [next, finish]);

	const showPaginationStep = !!settings && settings.defaultReaderMode !== "rsvp";
	const stepNodes: React.ReactNode[] = [
		<WelcomeStep key="welcome" />,
		<ThemeStep key="theme" />,
		<SpeedStep key="speed" />,
		<ReaderModeStep key="reader-mode" />,
		...(showPaginationStep ? [<PaginationStyleStep key="pagination-style" />] : []),
		<BooksStep key="books" />,
		<SyncStep key="sync" />,
	];
	const totalSteps = stepNodes.length;
	const dotCount = totalSteps - 1;

	const primary = footer?.primary;
	const secondary = footer?.secondary;
	const anyDisabled = primary?.disabled || secondary?.disabled;

	return (
		<OnboardingFooterContext.Provider value={ctxValue}>
			<div className="flex h-[100dvh] flex-col bg-background pt-[var(--safe-top)] pb-[var(--safe-bottom)] text-foreground">
				<div className="flex h-12 items-center justify-between px-4">
					{step > 0 ? (
						<Button
							variant="ghost"
							size="sm"
							onClick={back}
							disabled={anyDisabled}
							aria-label="Back"
						>
							<ChevronLeft className="size-4" />
							Back
						</Button>
					) : (
						<div />
					)}
					<Button variant="ghost" size="sm" onClick={finish} aria-label="Skip onboarding">
						Skip
					</Button>
				</div>

				<main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6">
					<div className="mx-auto my-auto w-full max-w-md">{stepNodes[step]}</div>
				</main>

				<div className="border-border border-t bg-background/95 px-6 py-4 backdrop-blur">
					<div className="mx-auto flex w-full max-w-md flex-col gap-2">
						{step > 0 && (
							<div className="mb-1 flex items-center justify-center gap-1.5" aria-hidden>
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
						)}
						<Button
							size="lg"
							className="w-full"
							onClick={primary?.onClick ?? next}
							disabled={primary?.disabled}
						>
							{primary?.label ?? "Continue"}
						</Button>
						{secondary && (
							<Button
								size="lg"
								variant="outline"
								className="w-full"
								onClick={secondary.onClick}
								disabled={secondary.disabled}
							>
								{secondary.label}
							</Button>
						)}
					</div>
				</div>
			</div>
		</OnboardingFooterContext.Provider>
	);
};

export default Onboarding;
