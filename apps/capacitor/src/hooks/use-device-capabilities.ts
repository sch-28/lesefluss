import { useMemo } from "react";
import { findDescriptor } from "../services/devices";
import { deriveCapabilities, type DeviceCapabilities } from "../services/devices/capabilities";

/**
 * Look up device capabilities from a persisted descriptorId.
 *
 * Returns null when the descriptorId is missing or unknown (descriptor was
 * removed in a newer app version, for example). Consumers should branch
 * on the null case and either fall back to a default UI or prompt the
 * user to re-pair the device.
 */
export function useDeviceCapabilities(descriptorId: string | null): DeviceCapabilities | null {
	return useMemo(() => {
		if (!descriptorId) {
			return null;
		}
		const descriptor = findDescriptor(descriptorId);
		return descriptor ? deriveCapabilities(descriptor) : null;
	}, [descriptorId]);
}
