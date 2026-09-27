import type { DbExecutor } from "~/db";

/**
 * Whether both users are current members of the same buddy read that has not
 * ended. Buddy reads do not exist yet, so nobody qualifies. Friend requests
 * and blocks between non-friends are gated on it.
 */
export async function sharesActiveBuddyRead(
	_exec: DbExecutor,
	_a: string,
	_b: string,
): Promise<boolean> {
	return false;
}
