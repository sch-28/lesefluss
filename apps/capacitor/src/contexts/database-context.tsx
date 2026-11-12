import { Button } from "@lesefluss/ui/button";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { type DbScreenState, DbStateScreen } from "../components/db-state-screen";
import { startCoverShrink } from "../services/covers/shrink-legacy-covers";
import { initDb, onDbMoved, resetAppData } from "../services/db";
import {
	DB_IN_USE_ERROR,
	STORAGE_BUSY_ERROR,
	STORAGE_UNAVAILABLE_ERROR,
} from "../services/db/driver/types";
import { bookKeys, statsKeys } from "../services/db/hooks/query-keys";
import { queries } from "../services/db/queries";
import { queryClient } from "../services/query-client";
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

/** Runs after the app is ready: rebuilding a word index costs a moment per book. */
async function healWordCounts(): Promise<void> {
	try {
		const healed = await queries.backfillWordCounts();
		if (healed === 0) return;
		log("db", `word count backfill healed ${healed} books`);
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: bookKeys.all }),
			queryClient.invalidateQueries({ queryKey: statsKeys.all }),
		]);
	} catch (err) {
		log.warn("db", "word count backfill failed:", err);
	}
}

type Phase = "starting" | DbScreenState | "error" | "ready";

const OPENING_SCREEN_DELAY_MS = 300;
const CLAIM_FLAG = "lesefluss:claim-db";

function phaseFor(err: Error): Phase {
	if (err.name === DB_IN_USE_ERROR || err.name === STORAGE_BUSY_ERROR) return "in-use";
	if (err.name === STORAGE_UNAVAILABLE_ERROR) return "unavailable";
	return "error";
}

/** A tab that let the library go reloads to take it back; the flag carries the claim across. */
function takeClaimFlag(): boolean {
	try {
		const claim = sessionStorage.getItem(CLAIM_FLAG) === "1";
		sessionStorage.removeItem(CLAIM_FLAG);
		return claim;
	} catch {
		return false;
	}
}

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [phase, setPhase] = useState<Phase>("starting");
	const [error, setError] = useState<Error | null>(null);
	const [isBusy, setIsBusy] = useState(false);
	const [isResetting, setIsResetting] = useState(false);
	const attempt = useRef(0);
	const openingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearOpeningTimer = useCallback(() => {
		if (openingTimer.current) clearTimeout(openingTimer.current);
		openingTimer.current = null;
	}, []);

	const start = useCallback(
		(claim: boolean) => {
			const current = ++attempt.current;
			const onWaiting = () => {
				if (openingTimer.current) return;
				openingTimer.current = setTimeout(() => {
					setPhase((p) => (p === "starting" ? "opening" : p));
				}, OPENING_SCREEN_DELAY_MS);
			};
			withTimeout(initDb({ claim, onWaiting }), INIT_TIMEOUT_MS)
				.then(async () => {
					try {
						const removed = await queries.cleanupOrphanedChapterRows();
						if (removed > 0) log("db", `cleanup removed ${removed} orphan chapter rows`);
					} catch (err) {
						log.warn("db", "orphan chapter cleanup failed:", err);
					}
					try {
						const removed = await queries.deleteOrphanedContentRows();
						if (removed > 0) log("db", `cleanup removed ${removed} unfinished imports`);
					} catch (err) {
						log.warn("db", "unfinished import cleanup failed:", err);
					}

					if (current !== attempt.current) return;
					clearOpeningTimer();
					setIsBusy(false);
					setPhase("ready");
					void healWordCounts();
					startCoverShrink();
				})
				.catch((err) => {
					if (current !== attempt.current) return;
					clearOpeningTimer();
					setIsBusy(false);
					log.error("db", "Database initialisation failed:", err);
					setError(err as Error);
					setPhase(phaseFor(err as Error));
				});
		},
		[clearOpeningTimer],
	);

	useEffect(() => {
		start(takeClaimFlag());
		const unsubscribe = onDbMoved(() => {
			// A claim can land while this tab is still starting; that start must not
			// show the app on the database that is closing under it.
			attempt.current++;
			clearOpeningTimer();
			setIsBusy(false);
			setPhase("moved");
		});
		return () => {
			attempt.current++;
			clearOpeningTimer();
			unsubscribe();
		};
	}, [start, clearOpeningTimer]);

	const claimHere = useCallback(() => {
		setIsBusy(true);
		start(true);
	}, [start]);

	// Caches and in-memory state still describe the library as it was before the
	// other tab changed it, so the tab starts over instead of picking up in place.
	const reclaimAfterMove = useCallback(() => {
		setIsBusy(true);
		try {
			sessionStorage.setItem(CLAIM_FLAG, "1");
			window.location.reload();
		} catch {
			queryClient.clear();
			start(true);
		}
	}, [start]);

	const retry = useCallback(() => {
		setIsBusy(true);
		start(false);
	}, [start]);

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

	if (phase === "opening") return <DbStateScreen state="opening" />;
	if (phase === "in-use")
		return <DbStateScreen state="in-use" onAction={claimHere} busy={isBusy} />;
	if (phase === "moved") {
		return <DbStateScreen state="moved" onAction={reclaimAfterMove} busy={isBusy} />;
	}
	if (phase === "unavailable") {
		return <DbStateScreen state="unavailable" onAction={retry} busy={isBusy} />;
	}

	if (phase === "error" && error) {
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

	// Render nothing while DB initializes so the native splash stays visible.
	if (phase !== "ready") return null;

	return (
		<DatabaseContext.Provider value={{ isReady: true, error: null }}>
			{children}
		</DatabaseContext.Provider>
	);
};

export const useDatabase = () => {
	const context = useContext(DatabaseContext);
	if (context === undefined) {
		throw new Error("useDatabase must be used within a DatabaseProvider");
	}
	return context;
};
