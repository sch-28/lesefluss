import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// No baseURL needed - Better Auth uses the current origin automatically (same-domain setup)
export const authClient = createAuthClient({ plugins: [adminClient()] });
export const { signIn, signUp, signOut, useSession } = authClient;
