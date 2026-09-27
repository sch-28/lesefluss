import type { ProfileView } from "@lesefluss/core";
import { SOCIAL_API } from "@lesefluss/core";
import { useQuery } from "@tanstack/react-query";
import { authedFetch } from "../authed-fetch";
import { socialKeys } from "../db/hooks/query-keys";
import { socialQueryDefaults } from "./cache";

function ownerTimeZone(): string | undefined {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return undefined;
	}
}

export async function fetchProfileView(
	userId: string,
	options: { asFriend?: boolean } = {},
): Promise<ProfileView> {
	const params = new URLSearchParams({ userId });
	if (options.asFriend) params.set("as", "friend");
	const tz = ownerTimeZone();
	if (tz) params.set("tz", tz);
	const res = await authedFetch(`${SOCIAL_API.profileView}?${params}`);
	return res.json();
}

export function useProfileView(
	userId: string,
	options: { asFriend?: boolean; enabled?: boolean } = {},
) {
	return useQuery({
		queryKey: socialKeys.profileView(userId, Boolean(options.asFriend)),
		queryFn: () => fetchProfileView(userId, options),
		enabled: options.enabled ?? true,
		...socialQueryDefaults,
	});
}
