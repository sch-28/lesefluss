import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { PageContainer } from "@/components/page-container";
import { useAutoSaveSettings } from "../../hooks/use-auto-save-settings";
import { useBackHandler } from "../../hooks/use-back-handler";
import { replayPendingLink } from "../../services/deep-links/use-deep-links";
import { buddyReadExists } from "../../services/social/buddy-reads";
import { type OnboardingFooter, OnboardingFooterContext } from "./footer-context";
import BooksStep from "./steps/books";
import PaginationStyleStep from "./steps/pagination-style";
import ReaderModeStep from "./steps/reader-mode";
import SpeedStep from "./steps/speed";
import SyncStep from "./steps/sync";
import ThemeStep from "./steps/theme";
import WelcomeStep from "./steps/welcome";

/** The height of a size="lg" button. */
const SECONDARY_SLOT = "h-9";

const Onboarding: React.FC = () => {
	const router = useRouter();
	const { settings, updateSetting, flush } = useAutoSaveSettings();
	const [step, setStep] = useState(0);
	const [footer, setFooter] = useState<OnboardingFooter | null>(null);

	const finish = useCallback(async () => {
		updateSetting("onboardingCompleted", true);
		await flush();
		if (await replayPendingLink(router, buddyReadExists)) return;
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

	// E-ink mode forces page mode, so the choice would do nothing there.
	const showPaginationStep =
		!!settings && settings.defaultReaderMode !== "rsvp" && !settings.einkMode;
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

	useBackHandler(step > 0, () => {
		if (!anyDisabled) back();
	});

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
					{/* The last step's own "Not now" already finishes. */}
					{step < totalSteps - 1 && (
						<Button variant="ghost" size="sm" onClick={finish}>
							Skip setup
						</Button>
					)}
				</div>

				<main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6">
					{/* Top-anchored, not centred: every step's heading starts at the same height,
					    and the speed test can change height between its rounds without a jump. */}
					<PageContainer width="flow" className="pt-[min(8dvh,4rem)]" data-testid="onboarding-step">
						{stepNodes[step]}
					</PageContainer>
				</main>

				<div className="border-border border-t bg-background/95 px-6 py-4 backdrop-blur">
					<PageContainer width="flow" className="flex flex-col gap-2">
						{/* Kept on the first step too, hidden, so the primary button never moves. */}
						<div
							className={cn(
								"mb-1 flex h-1.5 items-center justify-center gap-1.5",
								step === 0 && "invisible",
							)}
							aria-hidden
						>
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
						<Button
							size="lg"
							variant={primary?.outline ? "outline" : "default"}
							className="w-full"
							onClick={primary?.onClick ?? next}
							disabled={primary?.disabled}
						>
							{primary?.label ?? "Continue"}
						</Button>
						{/* An empty slot where a step has no second action keeps the footer one height. */}
						{secondary ? (
							<Button
								size="lg"
								variant="outline"
								className="w-full"
								onClick={secondary.onClick}
								disabled={secondary.disabled}
							>
								{secondary.label}
							</Button>
						) : (
							<div className={SECONDARY_SLOT} aria-hidden data-testid="onboarding-secondary-slot" />
						)}
					</PageContainer>
				</div>
			</div>
		</OnboardingFooterContext.Provider>
	);
};

export default Onboarding;
