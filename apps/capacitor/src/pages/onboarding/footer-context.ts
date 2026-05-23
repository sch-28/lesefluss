import { createContext, useContext } from "react";

export type OnboardingAction = {
	label: string;
	onClick: () => void | Promise<void>;
	disabled?: boolean;
};

export type OnboardingFooter = {
	primary: OnboardingAction;
	secondary?: OnboardingAction;
};

export type OnboardingFooterCtx = {
	next: () => void;
	finish: () => Promise<void>;
	setFooter: (f: OnboardingFooter | null) => void;
};

export const OnboardingFooterContext = createContext<OnboardingFooterCtx | null>(null);

export function useOnboardingFooter(): OnboardingFooterCtx {
	const ctx = useContext(OnboardingFooterContext);
	if (!ctx) throw new Error("useOnboardingFooter must be used inside OnboardingFooterContext");
	return ctx;
}
