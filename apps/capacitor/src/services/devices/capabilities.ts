/**
 * Device capabilities derived from a DeviceDescriptor.
 *
 * Capabilities are inferred from which characteristics the descriptor
 * declares. There is no separate capabilities-as-data layer: the descriptor
 * is the capability source. See ADR-0001 and CONTEXT.md.
 */

import type { DeviceDescriptor } from "../ble-transport/types";

export type DeviceCapabilities = {
	/** Descriptor id this snapshot was derived from. */
	descriptorId: string;
	/** True when the device exposes an on-device library characteristic. */
	isMultiBook: boolean;
	/** True when the device exposes an active-book selector characteristic. */
	hasActiveBookSelector: boolean;
	/** True when uploads carry a category (book vs article). */
	hasCategorizedUploads: boolean;
	/** Unit of the position characteristic. */
	positionUnit: "byte" | "word";
	/** Human-readable label for the device-list UI. */
	label: string;
	/** Brightness + inverse colors (ESP32 single-book only today). */
	hasDisplaySettings: boolean;
	/** Display-off + deep-sleep timeouts (ESP32 single-book only today). */
	hasPowerSettings: boolean;
	/** Dev-mode toggle (ESP32 single-book only today). */
	hasDevMode: boolean;
};

export function deriveCapabilities(descriptor: DeviceDescriptor): DeviceCapabilities {
	const hasLibrary = "library" in descriptor.chars;
	const isSingleBook = !hasLibrary;
	return {
		descriptorId: descriptor.id,
		isMultiBook: hasLibrary,
		hasActiveBookSelector: "active" in descriptor.chars,
		hasCategorizedUploads: hasLibrary,
		positionUnit: hasLibrary ? "word" : "byte",
		label: descriptor.deviceName,
		hasDisplaySettings: isSingleBook,
		hasPowerSettings: isSingleBook,
		hasDevMode: isSingleBook,
	};
}
