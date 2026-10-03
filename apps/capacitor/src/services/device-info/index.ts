import { Capacitor, registerPlugin } from "@capacitor/core";

type DeviceInfo = { manufacturer: string; brand: string; model: string };

type DeviceInfoPlugin = { getInfo(): Promise<DeviceInfo> };

const DeviceInfoNative = registerPlugin<DeviceInfoPlugin>("DeviceInfo");

let cached: Promise<DeviceInfo | null> | null = null;

/** Null off Android and on native shells built before the plugin existed. */
export function getDeviceInfo(): Promise<DeviceInfo | null> {
	if (!cached) {
		cached =
			Capacitor.getPlatform() === "android"
				? DeviceInfoNative.getInfo().catch(() => null)
				: Promise.resolve(null);
	}
	return cached;
}

/**
 * Makers whose Android devices are e-readers. Matched as substrings of the
 * lower-cased manufacturer and brand. The list only saves a tap: every device
 * can switch e-ink mode on by hand, so a missing maker costs nothing and a
 * maker that also sells LCD devices must stay off it.
 */
const EINK_MAKERS = [
	"onyx",
	"boox",
	"bigme",
	"boyue",
	"likebook",
	"meebook",
	"pocketbook",
	"dasung",
	"ratta",
	"supernote",
	"moaan",
	"inkpalm",
	"hanvon",
	"fidibook",
	"tolino",
	"kobo",
	"barnesandnoble",
];

export function isEinkManufacturer(info: Pick<DeviceInfo, "manufacturer" | "brand">): boolean {
	const names = [info.manufacturer, info.brand].map((name) => name.toLowerCase());
	return EINK_MAKERS.some((maker) => names.some((name) => name.includes(maker)));
}
