import type { SyncSettings } from "@lesefluss/core";

/**
 * Dev-only window hooks the sync service exposes for Playwright e2e tests. The
 * callsite is wrapped in `if (import.meta.env.DEV)`, so this tree-shakes out of
 * release bundles, like test-hooks/reader.ts.
 */

export type E2EApplyRemoteSettings = (patch: Partial<SyncSettings>) => Promise<void>;

/** Lets a test apply settings the way a sync pull adopts them from the server. */
export function exposeRemoteSettingsApply(apply: E2EApplyRemoteSettings): void {
	(
		window as unknown as { __lesefluss_e2e_applyRemoteSettings?: E2EApplyRemoteSettings }
	).__lesefluss_e2e_applyRemoteSettings = apply;
}
