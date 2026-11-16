/**
 * better-auth routes switched off. Accounts are deleted only through
 * deleteUserAccount, which purges and deletes in one transaction; better-auth's
 * own routes delete the user row apart from any purge (or skip it). Linking,
 * unlinking and every route that can refresh a provider token are off because
 * they let a session alone write account rows, which accountDeletionRefusal
 * reads as proof of a fresh sign-in. /account-info refreshes through
 * getAccessToken internally, which the router's own block on that path misses.
 */
export const DISABLED_AUTH_PATHS = [
	"/delete-user",
	"/admin/remove-user",
	"/link-social",
	"/unlink-account",
	"/get-access-token",
	"/refresh-token",
	"/account-info",
	"/list-accounts",
];
