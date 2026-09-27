const PG_UNIQUE_VIOLATION = "23505";

/** Drizzle wraps driver errors; the Postgres code sits on the cause. */
export function isUniqueViolation(err: unknown): boolean {
	const cause = err instanceof Error && err.cause ? err.cause : err;
	return typeof cause === "object" && cause !== null && "code" in cause
		? (cause as { code?: string }).code === PG_UNIQUE_VIOLATION
		: false;
}
