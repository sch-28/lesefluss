import { Capacitor, type PluginListenerHandle, registerPlugin } from "@capacitor/core";

export type VolumeKey = "up" | "down";

interface VolumeKeysPlugin {
	setEnabled(options: { enabled: boolean }): Promise<void>;
	addListener(
		event: "volumeKey",
		cb: (data: { key: VolumeKey }) => void,
	): Promise<PluginListenerHandle>;
}

const VolumeKeysNative = registerPlugin<VolumeKeysPlugin>("VolumeKeys");

export const IS_VOLUME_KEYS_SUPPORTED = Capacitor.getPlatform() === "android";

/** While enabled, volume keys stop changing the volume and reach `subscribeVolumeKeys` instead. */
export function setVolumeKeysEnabled(enabled: boolean): void {
	if (!IS_VOLUME_KEYS_SUPPORTED) return;
	VolumeKeysNative.setEnabled({ enabled }).catch(() => {});
}

export function subscribeVolumeKeys(
	handler: (key: VolumeKey) => void,
): Promise<PluginListenerHandle | null> | null {
	if (!IS_VOLUME_KEYS_SUPPORTED) return null;
	return VolumeKeysNative.addListener("volumeKey", ({ key }) => handler(key)).catch(() => null);
}
