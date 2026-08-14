/**
 * Opening a picker, on either platform, and telling a dismissal apart from a
 * failure. Shared by the single-file and folder sources so the cancel handling
 * cannot drift between them.
 */

/**
 * Dismissing an Android picker rejects with the plugin's own message rather than
 * resolving with an empty selection, so the caller-facing `CANCELLED` code has to
 * be recovered here. Without it the message reaches the UI verbatim and backing
 * out of the picker raises an "Import Failed" alert.
 */
export async function pickOrCancel<T>(pick: () => Promise<T>): Promise<T> {
	try {
		return await pick();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (/cancel/i.test(message)) throw new Error("CANCELLED");
		throw err;
	}
}

/**
 * Web file picker. `configure` sets `accept`, `multiple`, or `webkitdirectory`
 * on the input before it opens.
 *
 * Cancellation is detected two ways because neither alone is sufficient: the
 * `cancel` event is exact but only exists on recent engines, while the focus
 * heuristic (window regains focus with nothing picked) covers older ones and can
 * misfire when the browser interposes its own confirmation step. Whichever fires
 * first wins; a later `resolve` on a settled promise is a no-op.
 *
 * Rejects with `Error("CANCELLED")`.
 */
export function openWebFilePicker(configure: (input: HTMLInputElement) => void): Promise<File[]> {
	return new Promise((resolve, reject) => {
		const input = document.createElement("input");
		input.type = "file";
		configure(input);

		let hasPicked = false;
		input.onchange = () => {
			hasPicked = true;
			const files = Array.from(input.files ?? []);
			if (files.length === 0) return reject(new Error("CANCELLED"));
			resolve(files);
		};
		input.addEventListener("cancel", () => reject(new Error("CANCELLED")), { once: true });
		window.addEventListener(
			"focus",
			() => {
				setTimeout(() => {
					if (!hasPicked) reject(new Error("CANCELLED"));
				}, 300);
			},
			{ once: true },
		);

		input.click();
	});
}
