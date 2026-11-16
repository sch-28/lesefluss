import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { IS_WEB } from "../../utils/platform";

export type ShareOutcome = "shared" | "saved" | "cancelled";

function isCancel(err: unknown): boolean {
	if (err instanceof DOMException && err.name === "AbortError") return true;
	// The Share plugin rejects a dismissed sheet with this message on both platforms.
	return err instanceof Error && /cancel/i.test(err.message);
}

async function blobToBase64(blob: Blob): Promise<string> {
	const buffer = new Uint8Array(await blob.arrayBuffer());
	let binary = "";
	const CHUNK = 0x8000;
	for (let i = 0; i < buffer.length; i += CHUNK) {
		binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

function download(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Hands a share card PNG to the system share sheet; a browser without file sharing downloads it. */
export async function shareCardImage(blob: Blob, filename: string): Promise<ShareOutcome> {
	try {
		if (!IS_WEB) {
			await Filesystem.writeFile({
				path: filename,
				data: await blobToBase64(blob),
				directory: Directory.Cache,
			});
			const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
			await Share.share({ files: [uri] });
			return "shared";
		}
		const file = new File([blob], filename, { type: "image/png" });
		if (navigator.canShare?.({ files: [file] })) {
			await navigator.share({ files: [file] });
			return "shared";
		}
		download(blob, filename);
		return "saved";
	} catch (err) {
		if (isCancel(err)) return "cancelled";
		throw err;
	}
}
