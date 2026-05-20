import { useDeviceCapabilities } from "../../hooks/use-device-capabilities";
import { MultiBookSync } from "./multi-book-sync";
import { SingleBookSync } from "./single-book-sync";

export type DeviceSyncProps = {
	descriptorId: string | null;
};

/**
 * Dispatch wrapper. Reads capabilities from the connected device's
 * descriptor and renders the matching variant. Routes mount this and
 * stay device-agnostic.
 */
export function DeviceSync({ descriptorId }: DeviceSyncProps) {
	const caps = useDeviceCapabilities(descriptorId);
	if (!caps) {
		return null;
	}
	return caps.isMultiBook ? <MultiBookSync caps={caps} /> : <SingleBookSync caps={caps} />;
}
