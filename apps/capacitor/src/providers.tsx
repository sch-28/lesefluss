import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { BLEProvider } from "./contexts/ble-context";
import { BookSyncProvider } from "./contexts/book-sync-context";
import { DatabaseProvider } from "./contexts/database-context";
import { DeviceLibraryProvider } from "./contexts/device-library-context";
import { SyncProvider } from "./contexts/sync-context";
import { ThemeProvider } from "./contexts/theme-context";
import { queryClient } from "./services/query-client";

export function Providers({ children }: { children: ReactNode }) {
	return (
		<QueryClientProvider client={queryClient}>
			<DatabaseProvider>
				<SyncProvider>
					<ThemeProvider>
						<BLEProvider>
							<DeviceLibraryProvider>
								<BookSyncProvider>{children}</BookSyncProvider>
							</DeviceLibraryProvider>
						</BLEProvider>
					</ThemeProvider>
				</SyncProvider>
			</DatabaseProvider>
		</QueryClientProvider>
	);
}
