import { createAuthClient } from "better-auth/client";

// `import.meta.env` is undefined outside Vite (e.g. when Playwright's Node runner
// imports app modules via the reader page-object), so guard the access.
export const SYNC_URL = (import.meta.env?.VITE_SYNC_URL ?? "").trim();

export const syncAuthClient = SYNC_URL ? createAuthClient({ baseURL: SYNC_URL }) : null;
