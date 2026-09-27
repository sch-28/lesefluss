import { sendMail } from "~/lib/mailer";

export type Delivery =
	| { status: "sent"; at: number }
	| { status: "failed"; error: string; at: number }
	| { status: "skipped"; at: number };

/** A failed mail is a recorded fact, never an exception: the action it reports has already happened. */
export async function deliverMail(
	input: Parameters<typeof sendMail>[0],
	now = new Date(),
): Promise<Delivery> {
	try {
		await sendMail(input);
		return { status: "sent", at: now.getTime() };
	} catch (err) {
		return {
			status: "failed",
			error: err instanceof Error ? err.message : String(err),
			at: now.getTime(),
		};
	}
}
