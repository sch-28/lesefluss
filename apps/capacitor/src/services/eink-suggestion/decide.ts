type EinkSuggestion = "auto-enable" | "prompt" | "none";

/**
 * What to do about e-ink mode on this launch. A detected e-reader gets the
 * mode switched on before onboarding, so even the first screens do not ghost;
 * an install that is already set up is only asked, once. Either way the user's
 * later choice stands: nothing happens again after it was applied or declined.
 */
export function einkSuggestionFor(state: {
	isEinkDevice: boolean;
	isEinkMode: boolean;
	isOnboardingCompleted: boolean;
	wasAutoApplied: boolean;
	wasDismissed: boolean;
}): EinkSuggestion {
	if (!state.isEinkDevice || state.isEinkMode) return "none";
	if (state.wasAutoApplied || state.wasDismissed) return "none";
	return state.isOnboardingCompleted ? "prompt" : "auto-enable";
}
