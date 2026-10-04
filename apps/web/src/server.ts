import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { initServerErrorTracking } from "./lib/error-tracking-server";
import { startPushDrainer } from "./lib/push/drain";

initServerErrorTracking();
startPushDrainer();

export default createServerEntry({
	fetch(request) {
		return handler.fetch(request);
	},
});
