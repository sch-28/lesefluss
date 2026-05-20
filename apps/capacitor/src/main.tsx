import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { bootstrapCapacitor } from "./lib/bootstrap-capacitor";
import { Providers } from "./providers";
import { router } from "./router";
import { initWebSqlite } from "./services/db/web-setup";
// Legacy CSS (Ionic core + monochrome) must load BEFORE Tailwind so its
// @layer declarations register first; variables.css then re-declares the same
// order. See theme/legacy.css for why this file exists.
import "./theme/legacy.css";
import "./theme/variables.css";

async function bootstrap() {
	await Promise.all([initWebSqlite(), bootstrapCapacitor()]);

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
}

bootstrap();
