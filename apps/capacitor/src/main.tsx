import type { SyncBook, WordPosition } from "@lesefluss/core";
import { ENGINE_UNSUPPORTED_CLASS } from "@lesefluss/core/engine-support";
import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { bootstrapCapacitor } from "./lib/bootstrap-capacitor";
import { installStaleChunkReload } from "./lib/stale-chunk-reload";
import { bootMiniPopup, isMiniPopupPath } from "./pages/mini/mini-popup";
import { Providers } from "./providers";
import { router } from "./router";
import { registerAppServiceWorker } from "./services/app-update";
import { activeDriver } from "./services/db";
import { bookKeys } from "./services/db/hooks/query-keys";
import { queries } from "./services/db/queries";
import { reportMissedPosition } from "./services/position-revisions";
import { queryClient } from "./services/query-client";
import { requestPersistentStorage } from "./services/storage-persistence";
import { buildBookMergeUpdate } from "./services/sync/book-merge";
import { IS_WEB_BUILD } from "./services/sync/session";
import {
	exposeBookRowRead,
	exposeBookSessionsRead,
	exposeDbProbe,
	exposeRemotePosition,
} from "./test-hooks/db";
import { registerReaderFonts } from "./theme/reader-fonts";
// Legacy CSS (Ionic core + monochrome) must load BEFORE Tailwind so its
// @layer declarations register first; variables.css then re-declares the same
// order. See theme/legacy.css for why this file exists.
import "./theme/legacy.css";
import "./theme/variables.css";

async function bootstrap() {
	installStaleChunkReload(router);
	registerReaderFonts();
	await bootstrapCapacitor();
	if (import.meta.env.DEV) {
		exposeBookRowRead(async (id) => {
			const book = await queries.getBook(id);
			if (!book) return null;
			return {
				wordPosition: book.wordPosition,
				updatedAt: book.updatedAt,
				lastRead: book.lastRead,
			};
		});
		exposeBookSessionsRead(async (id) =>
			(await queries.getBookReadingSessions(id)).map(({ mode, durationMs, wordsRead }) => ({
				mode,
				durationMs,
				wordsRead,
			})),
		);
		const driver = () => {
			const active = activeDriver();
			if (!active) throw new Error("Database not open");
			return active;
		};
		exposeDbProbe({
			kind: () => activeDriver()?.kind ?? null,
			execute: (sql) => driver().execute(sql),
			query: (sql) => driver().query(sql),
			timePositionSave: async (bookId, word) => {
				const book = await queries.getBook(bookId);
				if (!book) throw new Error(`No book ${bookId}`);
				const start = performance.now();
				const result = await queries.writeReaderPosition(bookId, {
					wordPosition: word as WordPosition,
					lastRead: Date.now(),
					baseRev: book.updatedAt,
				});
				const ms = performance.now() - start;
				if (!result.isWritten) throw new Error(`Position save for ${bookId} did not land`);
				return ms;
			},
		});
		exposeRemotePosition(async (bookId, word, updatedAt, options = {}) => {
			const local = await queries.getBook(bookId);
			if (!local) throw new Error(`No book ${bookId}`);
			const server = { ...local, bookId, wordPosition: word, updatedAt } as unknown as SyncBook;
			const update = buildBookMergeUpdate(local, server);
			if (options.applyAfterNextSave) {
				const finished = () =>
					(window as { __lesefluss_e2e_saveFinished?: number }).__lesefluss_e2e_saveFinished ?? 0;
				const before = finished();
				while (finished() === before) await new Promise((r) => setTimeout(r, 20));
			}
			if (update) {
				const { skippedPosition } = await queries.applyBookMerge(bookId, update, updatedAt);
				if (skippedPosition) reportMissedPosition(bookId, skippedPosition);
			}
			if (options.invalidate !== false) {
				await queryClient.invalidateQueries({ queryKey: bookKeys.all });
			}
		});
	}

	const root = document.getElementById("root");
	if (!root) throw new Error("Root element #root not found");
	// StrictMode disabled: its mount→cleanup→mount cycle cancels the
	// ScrollView initial-scroll's fineScrollTo rAF chain before onReady fires,
	// leaving the reader skeleton stuck. Worked under Ionic because IonPage
	// deferred the mount past the StrictMode cycle.
	ReactDOM.createRoot(root).render(
		<Providers>
			<RouterProvider router={router} />
		</Providers>,
	);

	if (IS_WEB_BUILD) {
		void requestPersistentStorage();
		if (import.meta.env.PROD) void registerAppServiceWorker();
	}
}

// The inline engine check in index.html found an engine too old to render the
// app and is showing its notice instead.
if (!document.documentElement.classList.contains(ENGINE_UNSUPPORTED_CLASS)) {
	const root = document.getElementById("root");
	if (root && isMiniPopupPath(window.location.pathname, import.meta.env.BASE_URL)) {
		registerReaderFonts();
		bootMiniPopup(root);
	} else bootstrap();
}
