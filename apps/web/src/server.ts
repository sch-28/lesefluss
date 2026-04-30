import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { initServerErrorTracking } from "./lib/error-tracking-server";

initServerErrorTracking();

export default createServerEntry({
	fetch(request) {
		return handler.fetch(request);
	},
});
