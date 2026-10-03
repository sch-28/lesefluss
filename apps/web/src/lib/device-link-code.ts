import { randomInt } from "node:crypto";
import { DEVICE_LINK_CODE_ALPHABET, DEVICE_LINK_CODE_LENGTH } from "@lesefluss/core";

export function generateDeviceLinkUserCode(): string {
	let code = "";
	for (let i = 0; i < DEVICE_LINK_CODE_LENGTH; i++) {
		code += DEVICE_LINK_CODE_ALPHABET[randomInt(DEVICE_LINK_CODE_ALPHABET.length)];
	}
	return code;
}
