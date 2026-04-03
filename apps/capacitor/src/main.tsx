import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initWebSqlite } from "./services/db/web-setup";
import "./theme/variables.css";

async function bootstrap() {
	await initWebSqlite();

	ReactDOM.createRoot(document.getElementById("root")!).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
	);
}

bootstrap();
