import type { OwnSocialProfile, UpdateSocialProfileBody } from "@lesefluss/core";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { socialAvatar, socialProfile } from "~/db/schema";
import { isAllowedAccountPictureUrl } from "./avatar";

const AVATAR_PATH = "/api/social/avatar-image";

export function avatarUrlFor(avatarId: string | null): string | null {
	if (!avatarId) return null;
	// BETTER_AUTH_URL is the public origin; the request URL may be the
	// reverse proxy's internal one.
	return `${process.env.BETTER_AUTH_URL}${AVATAR_PATH}/${avatarId}`;
}

export async function getOwnProfile(userId: string): Promise<OwnSocialProfile | null> {
	const [row] = await db
		.select({
			name: user.name,
			image: user.image,
			handle: socialProfile.handle,
			handleChangedAt: socialProfile.handleChangedAt,
			bio: socialProfile.bio,
			visibility: socialProfile.visibility,
			showCurrentlyReading: socialProfile.showCurrentlyReading,
			showFinished: socialProfile.showFinished,
			showStats: socialProfile.showStats,
			showHighlights: socialProfile.showHighlights,
			avatarId: socialAvatar.id,
		})
		.from(user)
		.leftJoin(socialProfile, eq(socialProfile.userId, user.id))
		.leftJoin(socialAvatar, eq(socialAvatar.userId, user.id))
		.where(eq(user.id, userId));
	if (!row) return null;
	return {
		userId,
		handle: row.handle ?? null,
		handleChangedAt: row.handleChangedAt?.getTime() ?? null,
		name: row.name,
		bio: row.bio ?? null,
		avatarUrl: avatarUrlFor(row.avatarId),
		hasAccountPicture: isAllowedAccountPictureUrl(row.image),
		visibility: row.visibility ?? "private",
		showCurrentlyReading: row.showCurrentlyReading ?? true,
		showFinished: row.showFinished ?? true,
		showStats: row.showStats ?? true,
		showHighlights: row.showHighlights ?? true,
	};
}

export async function updateOwnProfile(
	userId: string,
	patch: UpdateSocialProfileBody,
): Promise<void> {
	const { name, bio, ...settings } = patch;
	const profileFields = {
		...settings,
		...(bio !== undefined ? { bio: bio === "" ? null : bio } : {}),
	};
	await db.transaction(async (tx) => {
		if (name !== undefined) {
			await tx.update(user).set({ name }).where(eq(user.id, userId));
		}
		if (Object.keys(profileFields).length > 0) {
			const now = new Date();
			await tx
				.insert(socialProfile)
				.values({ userId, ...profileFields, updatedAt: now })
				.onConflictDoUpdate({
					target: socialProfile.userId,
					set: { ...profileFields, updatedAt: now },
				});
		}
	});
}
