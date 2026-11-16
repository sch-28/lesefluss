import { useSyncContext } from "../../contexts/sync-context";
import { useOwnSocialProfile } from "../../services/social/profile";
import { SYNC_ENABLED } from "../../services/sync";

/** The reader's @handle for the card, null without a social profile. */
export function useShareHandle(): string | null {
	const { isLoggedIn } = useSyncContext();
	const profile = useOwnSocialProfile(SYNC_ENABLED && isLoggedIn);
	return profile.data?.handle ?? null;
}
