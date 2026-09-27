// Loaded lazily: `~/lib/auth` needs the OAuth and mail env at import time,
// which integration tests of the moderation flow do not have.
export type BanDeps = {
	ban(userId: string, reason: string, headers: Headers): Promise<void>;
	unban(userId: string, headers: Headers): Promise<void>;
};

export const betterAuthBan: BanDeps = {
	async ban(userId, reason, headers) {
		const { auth } = await import("~/lib/auth");
		await auth.api.banUser({ body: { userId, banReason: reason }, headers });
	},
	async unban(userId, headers) {
		const { auth } = await import("~/lib/auth");
		await auth.api.unbanUser({ body: { userId }, headers });
	},
};
