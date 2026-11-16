import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	isWeb: true,
	writeFile: vi.fn(),
	getUri: vi.fn(),
	share: vi.fn(),
}));

vi.mock("../../../utils/platform", () => ({
	get IS_WEB() {
		return state.isWeb;
	},
}));
vi.mock("@capacitor/filesystem", () => ({
	Directory: { Cache: "CACHE" },
	Filesystem: { writeFile: state.writeFile, getUri: state.getUri },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: state.share } }));

const { shareCardImage } = await import("../share");

const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
const nav = navigator as Navigator & { canShare?: unknown; share?: unknown };

beforeEach(() => {
	state.isWeb = true;
	state.writeFile.mockReset().mockResolvedValue({});
	state.getUri.mockReset().mockResolvedValue({ uri: "file:///cache/card.png" });
	state.share.mockReset().mockResolvedValue({});
	URL.createObjectURL = vi.fn(() => "blob:card");
	URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
	Reflect.deleteProperty(nav, "canShare");
	Reflect.deleteProperty(nav, "share");
});

describe("shareCardImage", () => {
	it("writes the PNG to the cache and shares the file natively", async () => {
		state.isWeb = false;
		expect(await shareCardImage(blob, "card.png")).toBe("shared");
		expect(state.writeFile).toHaveBeenCalledWith({
			path: "card.png",
			data: btoa(String.fromCharCode(137, 80, 78, 71)),
			directory: "CACHE",
		});
		expect(state.share).toHaveBeenCalledWith({ files: ["file:///cache/card.png"] });
	});

	it("reports a dismissed native sheet as cancelled", async () => {
		state.isWeb = false;
		state.share.mockRejectedValue(new Error("Share canceled"));
		expect(await shareCardImage(blob, "card.png")).toBe("cancelled");
	});

	it("uses the browser's file share where it has one", async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		Object.assign(nav, { canShare: () => true, share });
		expect(await shareCardImage(blob, "card.png")).toBe("shared");
		const [{ files }] = share.mock.calls[0] as [{ files: File[] }];
		expect(files[0].name).toBe("card.png");
	});

	it("downloads the card in a browser without file sharing", async () => {
		const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
		expect(await shareCardImage(blob, "card.png")).toBe("saved");
		expect(click).toHaveBeenCalled();
		click.mockRestore();
	});

	it("passes other failures on", async () => {
		state.isWeb = false;
		state.writeFile.mockRejectedValue(new Error("disk full"));
		await expect(shareCardImage(blob, "card.png")).rejects.toThrow("disk full");
	});
});
