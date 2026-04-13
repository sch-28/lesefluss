import { buildWordIndex, findWordIndexAtOffset } from "./rsvp-engine";

self.onmessage = (e: MessageEvent<{ content: string; byteOffset: number }>) => {
	const { content, byteOffset } = e.data;
	const words = buildWordIndex(content);
	const idx = findWordIndexAtOffset(words, byteOffset);
	self.postMessage({ words, idx });
};
