/**
 * Device link sign-in: the app shows a short code, a signed-in browser confirms
 * it, the app receives a session. The server runs better-auth's device
 * authorization flow; these are the bits both ends must agree on.
 */

export const DEVICE_LINK_CLIENT_ID = "lesefluss-app";
export const DEVICE_LINK_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

/** No 0/O/1/I, so a code read off an e-ink screen cannot be mistyped. */
export const DEVICE_LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const DEVICE_LINK_CODE_LENGTH = 8;

/** Uppercases and drops separators and whitespace a user may have typed. */
export function normalizeDeviceLinkCode(raw: string): string {
	return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isDeviceLinkCode(code: string): boolean {
	if (code.length !== DEVICE_LINK_CODE_LENGTH) return false;
	for (const char of code) {
		if (!DEVICE_LINK_CODE_ALPHABET.includes(char)) return false;
	}
	return true;
}

/** "ABCD2345" -> "ABCD-2345", the way the app prints it. */
export function formatDeviceLinkCode(code: string): string {
	const half = DEVICE_LINK_CODE_LENGTH / 2;
	return code.length === DEVICE_LINK_CODE_LENGTH
		? `${code.slice(0, half)}-${code.slice(half)}`
		: code;
}
