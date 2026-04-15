import { buildWordIndex, findWordIndexAtOffset } from "@lesefluss/rsvp-core";

self.onmessage = (e: MessageEvent<{ content: string; byteOffset: number }>) => {
	const { content, byteOffset } = e.data;
	const words = buildWordIndex(content);
	const idx = findWordIndexAtOffset(words, byteOffset);
	self.postMessage({ words, idx });
};
