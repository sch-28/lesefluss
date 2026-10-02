import { prepareImage } from "@lesefluss/book-import/utils/image-analysis";
import type { PrepareRequest, PrepareResponse } from "./image-prepare";

self.onmessage = async (event: MessageEvent<PrepareRequest>) => {
	const { id, blob, size } = event.data;
	let response: PrepareResponse;
	try {
		response = { id, prepared: await prepareImage(blob, size) };
	} catch (err) {
		response = { id, error: err instanceof Error ? err.message : String(err) };
	}
	self.postMessage(response);
};
