/** Origins shared by CORS middleware and better-auth trustedOrigins. */
export const ALLOWED_ORIGINS: string[] = [
	"capacitor://localhost",
	"http://localhost",
	...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3001"]),
	process.env.BETTER_AUTH_URL,
].filter(Boolean) as string[];
