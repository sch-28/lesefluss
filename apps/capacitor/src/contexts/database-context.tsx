import { Button } from "@lesefluss/ui/button";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { initDb, resetAppData } from "../services/db";
import { queries } from "../services/db/queries";
import { backfillAllBooks, type BackfillProgress } from "../services/db/word-index-backfill";
import { log } from "../utils/log";

interface DatabaseContextType {
	isReady: boolean;
	error: Error | null;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

const INIT_TIMEOUT_MS = 15_000;

class DatabaseInitTimeoutError extends Error {
	constructor() {
		super("Database initialisation timed out. The app may be stuck on startup.");
		this.name = "DatabaseInitTimeoutError";
	}
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new DatabaseInitTimeoutError()), ms);
		p.then(
			(v) => {
				clearTimeout(t);
				resolve(v);
			},
			(e) => {
				clearTimeout(t);
				reject(e);
			},
		);
	});
}

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [isReady, setIsReady] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [isResetting, setIsResetting] = useState(false);
	const [backfill, setBackfill] = useState<BackfillProgress | null>(null);

	useEffect(() => {
		let cancelled = false;
		withTimeout(initDb(), INIT_TIMEOUT_MS)
			.then(async () => {
				// One-shot cleanup of chapter rows orphaned by the legacy
				// tombstone-based deleteSeries. Power users had accumulated 10k+
				// dead rows that bloated every sync push. Idempotent.
				try {
					const removed = await queries.cleanupOrphanedChapterRows();
					if (removed > 0) log("db", `cleanup removed ${removed} orphan chapter rows`);
				} catch (err) {
					log.warn("db", "orphan chapter cleanup failed:", err);
				}

				// ADR-0002 word-index backfill: idempotent, runs every boot but
				// skips books already flagged `position_unit = 'word'`. Blocks
				// isReady so the reader cannot open a byte-only book.
				try {
					const summary = await backfillAllBooks((p) => {
						if (!cancelled) setBackfill(p);
					});
					if (summary.converted > 0) {
						log("db", `word-index backfill converted ${summary.converted} books`);
					}
				} catch (err) {
					log.error("db", "word-index backfill failed:", err);
					if (!cancelled) setError(err as Error);
					return;
				}

				if (!cancelled) setIsReady(true);
			})
			.catch((err) => {
				if (cancelled) return;
				log.error("db", "Database initialisation failed:", err);
				setError(err as Error);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const handleReset = useCallback(async () => {
		setIsResetting(true);
		try {
			await resetAppData();
			window.location.reload();
		} catch (err) {
			log.error("db", "resetAppData failed:", err);
			setIsResetting(false);
		}
	}, []);

	if (error) {
		return (
			<div className="flex h-screen items-center justify-center bg-background p-6">
				<div className="flex max-w-sm flex-col items-center gap-4 text-center">
					<h2 className="m-0 font-semibold text-lg">Lesefluss can't start</h2>
					<p className="m-0 text-sm opacity-80">{error.message}</p>
					<p className="m-0 text-xs opacity-60">
						Resetting clears local books, settings and highlights on this device. If you're signed
						in to cloud sync, they'll restore on next sign-in.
					</p>
					<Button onClick={handleReset} disabled={isResetting}>
						{isResetting ? "Resetting…" : "Reset app data"}
					</Button>
				</div>
			</div>
		);
	}

	// Render nothing while DB initializes so the native splash stays visible
	// (Capacitor SplashScreen plugin is hidden by __root once children mount).
	// Avoids the flash of an in-app spinner between native splash and AppShell.
	// Exception: the word-index backfill (ADR-0002) can take seconds on large
	// libraries, so we surface a minimal progress overlay instead of leaving
	// the native splash up indefinitely.
	if (!isReady) {
		if (backfill && backfill.total > 0) {
			return (
				<div className="flex h-screen items-center justify-center bg-background p-6">
					<div className="flex flex-col items-center gap-3 text-center">
						<p className="m-0 font-medium text-sm">Migrating reading positions…</p>
						<p className="m-0 text-xs opacity-60">
							{backfill.done} / {backfill.total}
						</p>
					</div>
				</div>
			);
		}
		return null;
	}

	return <DatabaseContext.Provider value={{ isReady, error }}>{children}</DatabaseContext.Provider>;
};

export const useDatabase = () => {
	const context = useContext(DatabaseContext);
	if (context === undefined) {
		throw new Error("useDatabase must be used within a DatabaseProvider");
	}
	return context;
};
