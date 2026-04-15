/** Origins shared by CORS middleware and better-auth trustedOrigins. */
const DEV_ORIGINS = ["http://localhost", "http://localhost:3001"];

export const ALLOWED_ORIGINS: string[] = [
	"capacitor://localhost",
	"https://localhost",
	...(process.env.NODE_ENV === "production" ? [] : DEV_ORIGINS),
	process.env.BETTER_AUTH_URL,
].filter(Boolean) as string[];
