export type SocialErrorCode =
	| "invalid"
	| "reserved"
	| "taken"
	| "cooldown"
	| "too_large"
	| "unsupported_image"
	| "no_account_picture"
	| "fetch_failed"
	| "not_found"
	| "limit_reached"
	| "handle_required"
	| "consent_required"
	| "not_shareable"
	| "already_shared"
	| "suspended"
	| "unavailable"
	| "full"
	| "already_member"
	| "not_host";

const STATUS_BY_CODE: Record<SocialErrorCode, number> = {
	invalid: 400,
	reserved: 409,
	taken: 409,
	cooldown: 429,
	too_large: 413,
	unsupported_image: 415,
	no_account_picture: 400,
	fetch_failed: 502,
	not_found: 404,
	limit_reached: 409,
	handle_required: 403,
	consent_required: 428,
	not_shareable: 409,
	already_shared: 409,
	suspended: 403,
	unavailable: 410,
	full: 409,
	already_member: 409,
	not_host: 403,
};

export class SocialError extends Error {
	readonly status: number;
	constructor(
		readonly code: SocialErrorCode,
		readonly retryAfterDays?: number,
	) {
		super(code);
		this.status = STATUS_BY_CODE[code];
	}
}
