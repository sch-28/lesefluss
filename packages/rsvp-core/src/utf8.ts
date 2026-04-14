const encoder = new TextEncoder();

/** UTF-8 byte length of a string (matches what the ESP32 sees via file.tell()). */
export function utf8ByteLength(s: string): number {
	return encoder.encode(s).length;
}
