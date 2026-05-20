import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { Bluetooth } from "lucide-react";
import type React from "react";
import { useBLE } from "../contexts/ble-context";
import { BLEConnectionState } from "../services/ble";

const BLEIndicator: React.FC = () => {
	const { connectionState, connectedDevice } = useBLE();

	const isConnected = connectionState === BLEConnectionState.CONNECTED;
	const isTransitioning =
		connectionState === BLEConnectionState.CONNECTING ||
		connectionState === BLEConnectionState.DISCONNECTING;

	if (!isConnected && !isTransitioning) return null;

	const statusLabel = isConnected
		? "Connected"
		: connectionState === BLEConnectionState.CONNECTING
			? "Connecting..."
			: "Disconnecting...";

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Bluetooth device status"
					className={`mr-3 inline-flex size-7 items-center justify-center text-foreground transition-opacity ${isTransitioning ? "opacity-40" : "opacity-60"}`}
				>
					<Bluetooth className="size-[18px]" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-auto min-w-[200px]">
				<div className="flex flex-col gap-1">
					<h3 className="font-semibold text-sm">{connectedDevice?.name || "Lesefluss"}</h3>
					<p className="text-muted-foreground text-sm">{statusLabel}</p>
					{isConnected && connectedDevice && (
						<p className="text-muted-foreground/70 text-xs">{connectedDevice.deviceId}</p>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
};

export default BLEIndicator;
