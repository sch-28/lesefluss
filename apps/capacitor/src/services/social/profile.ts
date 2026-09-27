import {
	type AvatarSourceBody,
	type ClaimHandleBody,
	type HandleAvailability,
	type HandleClaimFailure,
	handleClaimFailure,
	type OwnSocialProfile,
	parseSocialErrorBody,
	SOCIAL_API,
	type SocialErrorBody,
	type UpdateSocialProfileBody,
} from "@lesefluss/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthedFetchError, authedFetch } from "../authed-fetch";
import { socialKeys } from "../db/hooks/query-keys";
import { socialQueryDefaults } from "./cache";

async function getOwnProfile(): Promise<OwnSocialProfile> {
	const res = await authedFetch(SOCIAL_API.profile);
	return res.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
	const res = await authedFetch(path, { method: "POST", body: JSON.stringify(body) });
	return res.json();
}

export function checkHandle(handle: string): Promise<HandleAvailability> {
	return postJson(SOCIAL_API.handleCheck, { handle });
}

/** The `{ reason, retryAfterDays }` body of a rejected social request, if any. */
export function socialErrorBody(err: unknown): SocialErrorBody {
	return err instanceof AuthedFetchError ? parseSocialErrorBody(err.body) : {};
}

export function claimFailure(err: unknown): HandleClaimFailure {
	if (err instanceof AuthedFetchError)
		return handleClaimFailure(err.status, socialErrorBody(err).reason);
	return "offline";
}

export function useOwnSocialProfile(enabled = true) {
	return useQuery({
		queryKey: socialKeys.ownProfile,
		queryFn: getOwnProfile,
		enabled,
		...socialQueryDefaults,
	});
}

function useProfileMutation<TVariables>(run: (variables: TVariables) => Promise<OwnSocialProfile>) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: run,
		onSuccess: (profile) => queryClient.setQueryData(socialKeys.ownProfile, profile),
	});
}

export function useClaimHandle() {
	return useProfileMutation((body: ClaimHandleBody) => postJson(SOCIAL_API.handle, body));
}

export function useUpdateSocialProfile() {
	return useProfileMutation((body: UpdateSocialProfileBody) => postJson(SOCIAL_API.profile, body));
}

export function useUploadAvatar() {
	return useProfileMutation(async (file: File) => {
		const res = await authedFetch(SOCIAL_API.avatar, {
			method: "POST",
			headers: { "Content-Type": file.type },
			body: file,
		});
		return res.json();
	});
}

export function useSetAvatarSource() {
	return useProfileMutation((body: AvatarSourceBody) => postJson(SOCIAL_API.avatarSource, body));
}
