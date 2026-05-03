import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initWebSqlite } from "./services/db/web-setup";

// Shared Ionic + theme CSS for both the primary App and the secondary
// (Screen-2) WebView entry. Imported here so the secondary chunk picks it
// up automatically when it reuses Ionic components like RsvpSettingsForm.
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import "@ionic/react/css/padding.css";
import "@ionic/react/css/float-elements.css";
import "@ionic/react/css/text-alignment.css";
import "@ionic/react/css/text-transformation.css";
import "@ionic/react/css/flex-utils.css";
import "@ionic/react/css/display.css";
import "./theme/monochrome.css";
import "./theme/variables.css";

const isSecondary = new URLSearchParams(window.location.search).get("screen") === "2";

async function bootstrap() {
	const root = document.getElementById("root");
	if (!root) throw new Error("Root element #root not found");

	if (isSecondary) {
		const { SecondaryApp } = await import("./secondary");
		ReactDOM.createRoot(root).render(
			<React.StrictMode>
				<SecondaryApp />
			</React.StrictMode>,
		);
		return;
	}

	await initWebSqlite();
	ReactDOM.createRoot(root).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
	);
}

bootstrap();
