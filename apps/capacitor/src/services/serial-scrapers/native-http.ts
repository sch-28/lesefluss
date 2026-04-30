import { registerPlugin } from "@capacitor/core";

type NativeHttpPlugin = {
	request(options: {
		url: string;
		method?: "GET" | "POST";
		body?: string;
		contentType?: string;
		headers?: Record<string, string>;
	}): Promise<{
		status: number;
		data: string;
	}>;
	/** Fetches via a headless WebView — Chrome fingerprint bypasses CF blocks that reject OkHttp. */
	fetchViaWebView(options: { url: string; userAgent: string }): Promise<{
		status: number;
		data: string;
	}>;
	openChallenge(options: { url: string; userAgent: string }): Promise<void>;
};

export const NativeHttp = registerPlugin<NativeHttpPlugin>("NativeHttp");
