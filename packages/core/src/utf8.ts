const encoder = new TextEncoder();

/** UTF-8 byte length of a string (matches what the ESP32 sees via file.tell()). */
export function utf8ByteLength(s: string): number {
	return encoder.encode(s).length;
}

/** UTF-8 byte length of a single codepoint. */
export function utf8ByteLengthOfCodePoint(cp: number): number {
	if (cp < 0x80) return 1;
	if (cp < 0x800) return 2;
	if (cp < 0x10000) return 3;
	return 4;
}
