import { useEffect, useState } from "react";

/** Client-only, so the server render and hydration agree on the non-Android markup. */
export function useIsAndroid(): boolean {
	const [isAndroid, setIsAndroid] = useState(false);
	useEffect(() => setIsAndroid(/android/i.test(navigator.userAgent)), []);
	return isAndroid;
}
