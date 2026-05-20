import { IonApp, setupIonicReact } from "@ionic/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";

// Ionic + legacy theme CSS are imported via theme/variables.css inside cascade
// layers so Tailwind v4 utilities (layer: utilities) win on the cascade.
// Don't import them here as unlayered modules.

import { BLEProvider } from "./contexts/ble-context";
import { BookSyncProvider } from "./contexts/book-sync-context";
import { DatabaseProvider } from "./contexts/database-context";
import { SyncProvider } from "./contexts/sync-context";
import { ThemeProvider } from "./contexts/theme-context";
import { queryClient } from "./services/query-client";

// `animated: false` kills the Ionic page-transition slide. Without an
// IonRouterOutlet there's no destination to slide to; the animation would
// flash a light Ionic background over the dark shadcn AppShell during
// back-navigation from legacy IonPage children.
setupIonicReact({ mode: "md", animated: false });

// Match tanstack router's basepath (see router.tsx) so react-router-dom hooks
// in legacy Ionic pages stay aligned during the migration.
const BASENAME = import.meta.env.VITE_WEB_BUILD === "true" ? "/app" : undefined;

export function Providers({ children }: { children: ReactNode }) {
	return (
		<IonApp>
			<BrowserRouter basename={BASENAME}>
				<QueryClientProvider client={queryClient}>
					<DatabaseProvider>
						<SyncProvider>
							<ThemeProvider>
								<BLEProvider>
									<BookSyncProvider>{children}</BookSyncProvider>
								</BLEProvider>
							</ThemeProvider>
						</SyncProvider>
					</DatabaseProvider>
				</QueryClientProvider>
			</BrowserRouter>
		</IonApp>
	);
}
