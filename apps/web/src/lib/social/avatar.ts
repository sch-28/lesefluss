import { AVATAR_MAX_BYTES } from "@lesefluss/core";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { socialAvatar } from "~/db/schema";
import { SocialError } from "./errors";

const AVATAR_SIZE = 256;
const MAX_INPUT_PIXELS = 30_000_000;
const ACCOUNT_PICTURE_TIMEOUT_MS = 10_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

/**
 * Re-encodes any accepted upload as a square WebP. sharp writes no EXIF, ICC
 * or XMP unless asked to, so GPS and camera data never reach storage; the
 * orientation tag is applied by `rotate()` before it is dropped.
 */
export async function encodeAvatar(bytes: Buffer): Promise<Buffer> {
	if (bytes.byteLength > AVATAR_MAX_BYTES) throw new SocialError("too_large");
	const image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });
	const metadata = await image.metadata().catch(() => null);
	if (!metadata || !ACCEPTED_FORMATS.has(metadata.format)) {
		throw new SocialError("unsupported_image");
	}
	try {
		return await image
			.rotate()
			.resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
			.webp({ quality: 80 })
			.toBuffer();
	} catch (err) {
		if (err instanceof Error && err.message.includes("pixel limit")) {
			throw new SocialError("too_large");
		}
		throw new SocialError("unsupported_image");
	}
}

/** Replaces the stored avatar under a fresh id so the old URL stops resolving. */
export async function setAvatar(userId: string, bytes: Buffer): Promise<string> {
	const data = await encodeAvatar(bytes);
	return db.transaction(async (tx) => {
		await tx.delete(socialAvatar).where(eq(socialAvatar.userId, userId));
		const [row] = await tx.insert(socialAvatar).values({ userId, data }).returning({
			id: socialAvatar.id,
		});
		if (!row) throw new Error("avatar insert returned no row");
		return row.id;
	});
}

/**
 * Only the picture hosts of the configured OAuth providers. `user.image` is
 * writable by the user through better-auth's update-user endpoint, so without
 * this the server would fetch any URL a user chose to store there.
 */
const ACCOUNT_PICTURE_HOSTS = [/(^|\.)googleusercontent\.com$/, /^cdn\.discordapp\.com$/];

export function isAllowedAccountPictureUrl(value: string | null | undefined): boolean {
	if (!value) return false;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	return url.protocol === "https:" && ACCOUNT_PICTURE_HOSTS.some((host) => host.test(url.hostname));
}

/**
 * Buffers a body but stops as soon as it exceeds the cap. The Content-Length
 * header is optional (chunked uploads have none) and client-controlled, so the
 * running total is what enforces the limit.
 */
export async function readBodyCapped(
	body: ReadableStream<Uint8Array> | null,
	maxBytes: number,
): Promise<Buffer> {
	if (!body) return Buffer.alloc(0);
	const chunks: Uint8Array[] = [];
	let total = 0;
	const reader = body.getReader();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) throw new SocialError("too_large");
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	return Buffer.concat(chunks);
}

/** Copies the sign-in provider's picture once; it is never linked live. */
export async function setAvatarFromAccountPicture(userId: string): Promise<string> {
	const [row] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId));
	if (!row?.image || !isAllowedAccountPictureUrl(row.image)) {
		throw new SocialError("no_account_picture");
	}
	let response: Response;
	try {
		response = await fetch(row.image, {
			signal: AbortSignal.timeout(ACCOUNT_PICTURE_TIMEOUT_MS),
			redirect: "manual",
		});
	} catch {
		throw new SocialError("fetch_failed");
	}
	if (!response.ok) throw new SocialError("fetch_failed");
	const bytes = await readBodyCapped(response.body, AVATAR_MAX_BYTES);
	return setAvatar(userId, bytes);
}

export async function removeAvatar(userId: string): Promise<void> {
	await db.delete(socialAvatar).where(eq(socialAvatar.userId, userId));
}

export async function getAvatarData(id: string): Promise<Buffer | null> {
	const [row] = await db
		.select({ data: socialAvatar.data })
		.from(socialAvatar)
		.where(eq(socialAvatar.id, id));
	return row?.data ?? null;
}
