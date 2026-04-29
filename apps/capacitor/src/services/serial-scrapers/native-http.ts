import { registerPlugin } from "@capacitor/core";

type NativeHttpPlugin = {
	request(options: {
		url: string;
		headers?: Record<string, string>;
	}): Promise<{
		status: number;
		data: string;
	}>;
	openChallenge(options: { url: string; userAgent: string }): Promise<void>;
};

export const NativeHttp = registerPlugin<NativeHttpPlugin>("NativeHttp");
