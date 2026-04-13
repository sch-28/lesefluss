import { IonIcon, IonItem, IonLabel, IonList, IonPopover } from "@ionic/react";
import { bluetooth } from "ionicons/icons";
import type React from "react";
import { useState } from "react";
import { useBLE } from "../contexts/ble-context";
import { BLEConnectionState } from "../services/ble";

const BLEIndicator: React.FC = () => {
	const { connectionState, connectedDevice } = useBLE();
	const [popoverEvent, setPopoverEvent] = useState<MouseEvent | undefined>(undefined);

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
		<>
			<IonIcon
				icon={bluetooth}
				onClick={(e) => setPopoverEvent(e.nativeEvent)}
				style={{
					fontSize: "18px",
					opacity: isTransitioning ? 0.4 : 0.6,
					marginRight: "12px",
					cursor: "pointer",
				}}
			/>
			<IonPopover
				isOpen={!!popoverEvent}
				event={popoverEvent}
				onDidDismiss={() => setPopoverEvent(undefined)}
				dismissOnSelect
			>
				<IonList lines="none" style={{ padding: "4px 0" }}>
					<IonItem>
						<IonLabel>
							<h3 style={{ fontWeight: 600 }}>
								{connectedDevice?.name || "RSVP-Reader"}
							</h3>
							<p>{statusLabel}</p>
							{isConnected && connectedDevice && (
								<p style={{ fontSize: "0.75rem", opacity: 0.6 }}>
									{connectedDevice.deviceId}
								</p>
							)}
						</IonLabel>
					</IonItem>
				</IonList>
			</IonPopover>
		</>
	);
};

export default BLEIndicator;
