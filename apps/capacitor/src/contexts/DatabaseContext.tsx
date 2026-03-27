import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../services/database';

interface DatabaseContextType {
  isReady: boolean;
  error: Error | null;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initDatabase = async () => {
      try {
        await db.initialize();
        setIsReady(true);
      } catch (err) {
        console.error('Database initialization failed:', err);
        setError(err as Error);
      }
    };

    initDatabase();

    return () => {
      db.close().catch(console.error);
    };
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
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
};
