/**
 * Live-test setup. Runs only via `vitest.live.config.ts` (env: "node") — the
 * default unit suite uses happy-dom which already provides DOMParser.
 *
 * We need Node's native `fetch` (no SOP, reliable) for hitting upstream
 * providers, but adapter code calls `new DOMParser()` to parse the response.
 * Polyfill DOMParser using happy-dom's programmatic API so the adapter is
 * unchanged between unit and live runs.
 */
import { Window } from "happy-dom";

if (typeof globalThis.DOMParser === "undefined") {
	class NodeDOMParser {
		parseFromString(html: string, _type: DOMParserSupportedType): Document {
			// Provide a real base URL so happy-dom can resolve relative <link>/<script>
			// hrefs without throwing "Invalid URL" on preload. The host value is
			// arbitrary — we never actually load these assets; we only query the DOM.
			const win = new Window({ url: "https://localhost/" });
			win.document.write(html);
			return win.document as unknown as Document;
		}
	}
	(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser =
		NodeDOMParser as unknown as typeof DOMParser;
}
