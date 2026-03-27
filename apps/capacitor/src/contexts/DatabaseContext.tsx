import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { initDb } from "../db";

interface DatabaseContextType {
	isReady: boolean;
	error: Error | null;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(
	undefined,
);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [isReady, setIsReady] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		initDb()
			.then(() => setIsReady(true))
			.catch((err) => {
				console.error("Database initialisation failed:", err);
				setError(err as Error);
			});
	}, []);

	return (
		<DatabaseContext.Provider value={{ isReady, error }}>
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
