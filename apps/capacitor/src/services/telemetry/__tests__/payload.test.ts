import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/app", () => ({ App: { getInfo: async () => ({ version: "1.6.0" }) } }));
let platform = "android";
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => platform } }));
vi.mock("../../sync/auth-client", () => ({
	SYNC_URL: "https://lesefluss.app",
	syncAuthClient: null,
}));

const BOOX_UA =
	"Mozilla/5.0 (Linux; Android 11; NovaAir2 Build/RKQ1.210614.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.159 Safari/537.36";

beforeEach(() => {
	localStorage.setItem("lesefluss:telemetry-enabled", "true");
});

afterEach(() => {
	localStorage.clear();
	platform = "android";
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

	it("sends nothing from the web app, even with a sync URL configured", async () => {
		platform = "web";
		vi.stubGlobal("navigator", { userAgent: BOOX_UA });
		const fetchMock = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal("fetch", fetchMock);
		const { reportEvent } = await import("../index");
		reportEvent("db_write_error", { message: "disk full" });
		// One macrotask lets every queued microtask of send() run first.
		await new Promise((resolve) => setTimeout(resolve));
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("telemetry consent", () => {
	async function load() {
		vi.stubGlobal("navigator", { userAgent: BOOX_UA });
		const fetchMock = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal("fetch", fetchMock);
		const telemetry = await import("../index");
		const settle = () => new Promise((resolve) => setTimeout(resolve));
		return { ...telemetry, fetchMock, settle };
	}

	it("sends nothing on an install or update that never touched the setting", async () => {
		localStorage.clear();
		const { reportEvent, isTelemetryEnabled, fetchMock, settle } = await load();
		expect(isTelemetryEnabled()).toBe(false);
		reportEvent("db_write_error", { message: "disk full" });
		await settle();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("starts sending once turned on, and stops at once when turned off", async () => {
		localStorage.clear();
		const { reportEvent, setTelemetryEnabled, fetchMock, settle } = await load();
		setTelemetryEnabled(true);
		reportEvent("db_write_error");
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		setTelemetryEnabled(false);
		reportEvent("position_save_failed");
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(localStorage.getItem("lesefluss:telemetry-enabled")).toBe("false");
	});
});
