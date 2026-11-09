type MobileHints = {
	userAgent: string;
	platform: string;
	maxTouchPoints: number;
	uaDataMobile?: boolean;
	isPrimaryPointerCoarse: boolean;
};

/** Phones and tablets. */
export function isMobileBrowser({
	userAgent,
	platform,
	maxTouchPoints,
	uaDataMobile,
	isPrimaryPointerCoarse,
}: MobileHints): boolean {
	// Tablets that request the desktop site send a desktop user agent; a touchscreen laptop's primary pointer is still fine.
	if (uaDataMobile || isPrimaryPointerCoarse) return true;
	if (/Android|iPhone|iPad|iPod|Mobi/i.test(userAgent)) return true;
	// iPadOS Safari reports itself as a Mac.
	return platform === "MacIntel" && maxTouchPoints > 1;
}

export function isMobileNavigator(): boolean {
	if (typeof navigator === "undefined") return false;
	const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
	return isMobileBrowser({
		userAgent: nav.userAgent,
		platform: nav.platform,
		maxTouchPoints: nav.maxTouchPoints ?? 0,
		uaDataMobile: nav.userAgentData?.mobile,
		isPrimaryPointerCoarse:
			typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
	});
}
