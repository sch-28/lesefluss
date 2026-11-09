import { beforeEach, describe, expect, it, vi } from "vitest";

let isNative = false;
let isMobile = false;
let configured: HTMLInputElement | null = null;

vi.mock("@capacitor/core", () => ({
	Capacitor: { isNativePlatform: () => isNative },
	registerPlugin: () => ({}),
}));
vi.mock("@capawesome/capacitor-file-picker", () => ({ FilePicker: {} }));
vi.mock("../../../utils/mobile-browser", () => ({ isMobileNavigator: () => isMobile }));
vi.mock("../sources/pick-dialog", () => ({
	pickOrCancel: <T>(pick: () => Promise<T>) => pick(),
	openWebFilePicker: async (configure: (input: HTMLInputElement) => void) => {
		configured = document.createElement("input");
		configure(configured);
		return [
			new File(["x"], "Morning Star.epub", { type: "application/epub+zip" }),
			new File(["x"], "cover.jpg", { type: "image/jpeg" }),
		];
	},
}));

const { batchPickerKind, pickBookFolder } = await import("../sources/folder-scan");

beforeEach(() => {
	isNative = false;
	isMobile = false;
	configured = null;
});

describe("batch picker on the web", () => {
	it("opens a folder picker on desktop and offers the books in it", async () => {
		expect(batchPickerKind()).toBe("folder");
		const scan = await pickBookFolder();
		expect(configured?.webkitdirectory).toBe(true);
		expect(configured?.multiple).toBe(true);
		expect(scan.files.map((file) => file.name)).toEqual(["Morning Star.epub"]);
	});

	it("opens a plain multi-file picker on a phone, and says so", async () => {
		isMobile = true;
		expect(batchPickerKind()).toBe("files");
		await pickBookFolder();
		expect(configured?.webkitdirectory ?? false).toBe(false);
		expect(configured?.multiple).toBe(true);
		expect(configured?.accept).toContain(".epub");
	});

	it("is a folder picker in the native app, phone or not", () => {
		isNative = true;
		isMobile = true;
		expect(batchPickerKind()).toBe("folder");
	});
});
