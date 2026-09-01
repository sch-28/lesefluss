/**
 * Applies migrations and exits. The server also migrates on boot; this exists so
 * CI can replay the whole chain against a fresh database, where a migration that
 * cannot apply from scratch fails the build rather than someone's deploy.
 */
import { migrate } from "./migrate.js";

migrate()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("[migrate] failed:", err);
		process.exit(1);
	});
