import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
	Capacitor: {
		isNativePlatform: () => true,
		getPlatform: () => "android",
	},
}));

const mockRequest = vi.fn();
const mockFetchViaWebView = vi.fn();
vi.mock("../native-http", () => ({
	NativeHttp: {
		request: (opts: unknown) => mockRequest(opts),
		fetchViaWebView: (opts: unknown) => mockFetchViaWebView(opts),
		openChallenge: vi.fn(),
	},
}));

import { fetchHtml } from "../fetch";

const CF_BODY =
	'<html><head><title>Just a moment...</title></head><body><div id="challenge-form"></div></body></html>';
const OK_BODY = "<html><body>real content</body></html>";

beforeEach(() => {
	mockRequest.mockReset();
	mockFetchViaWebView.mockReset();
});

describe("fetchHtml native CF fallback", () => {
	it("returns OkHttp body when not blocked", async () => {
		mockRequest.mockResolvedValue({ status: 200, data: OK_BODY });
		await expect(fetchHtml("https://x.test/a")).resolves.toBe(OK_BODY);
		expect(mockFetchViaWebView).not.toHaveBeenCalled();
	});

	it("falls back to WebView on 403 and returns its body", async () => {
		mockRequest.mockResolvedValue({ status: 403, data: "" });
		mockFetchViaWebView.mockResolvedValue({ status: 200, data: OK_BODY });
		await expect(fetchHtml("https://x.test/a")).resolves.toBe(OK_BODY);
		expect(mockFetchViaWebView).toHaveBeenCalledOnce();
	});

	it("falls back when OkHttp returns 200 with a CF interstitial body", async () => {
		mockRequest.mockResolvedValue({ status: 200, data: CF_BODY });
		mockFetchViaWebView.mockResolvedValue({ status: 200, data: OK_BODY });
		await expect(fetchHtml("https://x.test/a")).resolves.toBe(OK_BODY);
	});

	it("throws CLOUDFLARE_CHALLENGE only when the WebView body is also a challenge page", async () => {
		mockRequest.mockResolvedValue({ status: 403, data: "" });
		mockFetchViaWebView.mockResolvedValue({ status: 200, data: CF_BODY });
		await expect(fetchHtml("https://x.test/a")).rejects.toThrow("CLOUDFLARE_CHALLENGE");
	});

	it("surfaces non-CF WebView HTTP failures as FETCH_FAILED", async () => {
		mockRequest.mockResolvedValue({ status: 403, data: "" });
		mockFetchViaWebView.mockResolvedValue({ status: 502, data: "<h1>Bad Gateway</h1>" });
		await expect(fetchHtml("https://x.test/a")).rejects.toThrow("FETCH_FAILED:502");
	});

	it("treats WebView 403/503 status as CLOUDFLARE_CHALLENGE (CF still blocking)", async () => {
		mockRequest.mockResolvedValue({ status: 403, data: "" });
		mockFetchViaWebView.mockResolvedValue({ status: 403, data: "<h1>Forbidden</h1>" });
		await expect(fetchHtml("https://x.test/a")).rejects.toThrow("CLOUDFLARE_CHALLENGE");
	});

	it("treats WebView FETCH_FAILED:403 rejection as CLOUDFLARE_CHALLENGE", async () => {
		mockRequest.mockResolvedValue({ status: 403, data: "" });
		mockFetchViaWebView.mockRejectedValue(new Error("FETCH_FAILED:403"));
		await expect(fetchHtml("https://x.test/a")).rejects.toThrow("CLOUDFLARE_CHALLENGE");
	});

	it("propagates native timeout rejections without masking as CF", async () => {
		mockRequest.mockResolvedValue({ status: 403, data: "" });
		mockFetchViaWebView.mockRejectedValue(new Error("FETCH_FAILED: timeout"));
		await expect(fetchHtml("https://x.test/a")).rejects.toThrow("FETCH_FAILED: timeout");
	});

	it("treats OkHttp 4xx (non-403) as FETCH_FAILED without WebView fallback", async () => {
		mockRequest.mockResolvedValue({ status: 404, data: "" });
		await expect(fetchHtml("https://x.test/a")).rejects.toThrow("FETCH_FAILED:404");
		expect(mockFetchViaWebView).not.toHaveBeenCalled();
	});
});
