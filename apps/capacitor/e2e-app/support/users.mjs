/**
 * Accounts seeded into the throwaway database before the server starts. They
 * are verified and have a password, so the real /login page signs them in.
 */
export const PASSWORD = "e2e-app-password";

/** @type {Record<string, { id: string; name: string; email: string; handle: string | null }>} */
export const USERS = {
	/** Creates the invite link. */
	ada: { id: "e2e-ada", name: "Ada", email: "ada@e2e.lesefluss.test", handle: "ada_e2e" },
	/** Redeems it, signed out at first. */
	bea: { id: "e2e-bea", name: "Bea", email: "bea@e2e.lesefluss.test", handle: "bea_e2e" },
	/** Friends in one buddy read, for the live board. */
	cy: { id: "e2e-cy", name: "Cy", email: "cy@e2e.lesefluss.test", handle: "cy_e2e" },
	dee: { id: "e2e-dee", name: "Dee", email: "dee@e2e.lesefluss.test", handle: "dee_e2e" },
	/** Flips the website's social toggles. */
	eve: { id: "e2e-eve", name: "Eve", email: "eve@e2e.lesefluss.test", handle: "eve_e2e" },
	/** Signs in from onboarding and from the signed-out social tab. */
	fay: { id: "e2e-fay", name: "Fay", email: "fay@e2e.lesefluss.test", handle: null },
};

export const DB_PREFIX = "lesefluss_e2e_app_";
