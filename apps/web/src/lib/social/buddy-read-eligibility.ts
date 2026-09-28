import { sql } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { user } from "~/db/auth-schema";

/**
 * Whether both users are current members (active, linked book still live) of
 * the same buddy read, finished or not, and neither is banned. Must agree with
 * `loadState` in buddy-reads.ts, which applies the same rule to participant lists. Invitees never count. Friend requests and blocks
 * between non-friends are gated on it.
 */
export async function sharesActiveBuddyRead(
	exec: DbExecutor,
	a: string,
	b: string,
	now = new Date(),
): Promise<boolean> {
	if (a === b) return false;
	const result = await exec.execute(sql`
		SELECT 1
		FROM buddy_read_member ma
		JOIN buddy_read_member mb ON mb.buddy_read_id = ma.buddy_read_id
		JOIN ${user} ua ON ua.id = ma.user_id
		JOIN ${user} ub ON ub.id = mb.user_id
		WHERE ma.user_id = ${a} AND mb.user_id = ${b}
		  AND ma.state = 'active' AND mb.state = 'active'
		  AND EXISTS (SELECT 1 FROM sync_books s WHERE s.user_id = ma.user_id AND s.book_id = ma.book_id AND NOT s.deleted)
		  AND EXISTS (SELECT 1 FROM sync_books s WHERE s.user_id = mb.user_id AND s.book_id = mb.book_id AND NOT s.deleted)
		  AND (ua.banned IS NOT TRUE OR ua.ban_expires <= ${now})
		  AND (ub.banned IS NOT TRUE OR ub.ban_expires <= ${now})
		LIMIT 1
	`);
	return result.rows.length > 0;
}
