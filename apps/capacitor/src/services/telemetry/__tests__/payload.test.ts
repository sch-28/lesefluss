import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/app", () => ({ App: { getInfo: async () => ({ version: "1.6.0" }) } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "android" } }));
vi.mock("../../sync/auth-client", () => ({
	SYNC_URL: "https://lesefluss.app",
	syncAuthClient: null,
}));

const BOOX_UA =
	"Mozilla/5.0 (Linux; Android 11; NovaAir2 Build/RKQ1.210614.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.159 Safari/537.36";

afterEach(() => {
	vi.unstubAllGlobals();
	// The module throttles repeat events of a type; each test needs a fresh copy.
	vi.resetModules();
});

async function sentBody(userAgent: string) {
	vi.stubGlobal("navigator", { userAgent });
	const fetchMock = vi.fn().mockResolvedValue({ ok: true });
	vi.stubGlobal("fetch", fetchMock);
	const { reportEvent } = await import("../index");
	reportEvent("db_write_error", { message: "disk full" });
	await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
	const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
	return { url, body: JSON.parse(init.body as string) };
}

describe("telemetry payload", () => {
	it("carries the WebView version next to the OS version", async () => {
		const { url, body } = await sentBody(BOOX_UA);
		expect(url).toBe("https://lesefluss.app/api/telemetry");
		expect(body).toMatchObject({
			type: "db_write_error",
			message: "disk full",
			version: "1.6.0",
			platform: "android",
			os: "Android 11",
			webview: "149.0.7827.159",
		});
	});

	it("leaves the WebView version out when the engine is not Chromium", async () => {
		const { body } = await sentBody(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
		);
		expect(body).not.toHaveProperty("webview");
	});
});
