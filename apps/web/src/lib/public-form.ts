export const MAX_FORM_BODY_BYTES = 12_000;

export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Reads a JSON body while counting bytes; null once the cap is passed, whatever the header said. */
export async function readBodyCapped(
	request: Request,
	maxBytes = MAX_FORM_BODY_BYTES,
): Promise<string | null> {
	const declared = Number.parseInt(request.headers.get("content-length") ?? "", 10);
	if (Number.isFinite(declared) && declared > maxBytes) return null;
	if (!request.body) return "";
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let total = 0;
	let text = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			return null;
		}
		text += decoder.decode(value, { stream: true });
	}
	return text + decoder.decode();
}
