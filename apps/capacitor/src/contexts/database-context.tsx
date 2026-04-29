import { IonButton, IonContent, IonPage, IonSpinner } from "@ionic/react";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { initDb, resetAppData } from "../services/db";
import { queries } from "../services/db/queries";
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

	useEffect(() => {
		let cancelled = false;
		withTimeout(initDb(), INIT_TIMEOUT_MS)
			.then(async () => {
				// One-shot cleanup of chapter rows orphaned by the legacy
				// tombstone-based deleteSeries — power users had accumulated 10k+
				// dead rows that bloated every sync push. Idempotent. (TASK-102)
				try {
					const removed = await queries.cleanupOrphanedChapterRows();
					if (removed > 0) log("db", `cleanup removed ${removed} orphan chapter rows`);
				} catch (err) {
					log.warn("db", "orphan chapter cleanup failed:", err);
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
			<IonPage>
				<IonContent className="ion-padding">
					<div className="flex h-full flex-col items-center justify-center gap-4 text-center">
						<h2 className="font-semibold text-lg">Lesefluss can't start</h2>
						<p className="max-w-sm text-sm opacity-80">{error.message}</p>
						<p className="max-w-sm text-xs opacity-60">
							Resetting clears local books, settings and highlights on this device. If you're signed
							in to cloud sync, they'll restore on next sign-in.
						</p>
						<IonButton onClick={handleReset} disabled={isResetting}>
							{isResetting ? "Resetting…" : "Reset app data"}
						</IonButton>
					</div>
				</IonContent>
			</IonPage>
		);
	}

	if (!isReady) {
		return (
			<IonPage>
				<IonContent className="ion-padding ion-text-center">
					<div className="flex h-full items-center justify-center">
						<IonSpinner />
					</div>
				</IonContent>
			</IonPage>
		);
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
