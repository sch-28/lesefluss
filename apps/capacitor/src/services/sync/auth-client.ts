import { createAuthClient } from "better-auth/client";

export const SYNC_URL = (import.meta.env.VITE_SYNC_URL ?? "").trim();

export const syncAuthClient = SYNC_URL ? createAuthClient({ baseURL: SYNC_URL }) : null;
