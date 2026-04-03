import { IonContent, IonPage, IonSpinner } from "@ionic/react";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { initDb } from "../services/db";
import { log } from "../utils/log";

interface DatabaseContextType {
	isReady: boolean;
	error: Error | null;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [isReady, setIsReady] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		initDb()
			.then(() => setIsReady(true))
			.catch((err) => {
				log.error("db", "Database initialisation failed:", err);
				setError(err as Error);
			});
	}, []);

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
