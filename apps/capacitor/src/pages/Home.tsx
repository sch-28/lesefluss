import {
	IonAlert,
	IonBadge,
	IonButton,
	IonCard,
	IonCardContent,
	IonCardHeader,
	IonCardTitle,
	IonContent,
	IonIcon,
	IonItem,
	IonLabel,
	IonList,
	IonPage,
	IonSpinner,
	IonText,
	IonToast,
} from "@ionic/react";
import { bluetooth, book, checkmarkCircle, closeCircle, ellipse } from "ionicons/icons";
import type React from "react";
import { useState } from "react";
import { BLEConnectionState } from "../ble";
import { useBLE } from "../contexts/BLEContext";

const Home: React.FC = () => {
	const {
		isConnected,
		connectionState,
		connectedDevice,
		isScanning,
		scannedDevices,
		stopScan,
		connect,
		disconnect,
		error,
		clearError,
	} = useBLE();

	const [showDisconnectAlert, setShowDisconnectAlert] = useState(false);

	const handleDeviceSelect = async (deviceId: string) => {
		await stopScan();
		await connect(deviceId);
	};

	const handleDisconnect = async () => {
		await disconnect();
		setShowDisconnectAlert(false);
	};

	const getConnectionStatusColor = () => {
		switch (connectionState) {
			case BLEConnectionState.CONNECTED:
				return "success";
			case BLEConnectionState.CONNECTING:
			case BLEConnectionState.DISCONNECTING:
				return "warning";
			default:
				return "medium";
		}
	};

	const getConnectionStatusText = () => {
		switch (connectionState) {
			case BLEConnectionState.CONNECTED:
				return `Connected to ${connectedDevice?.name || "device"}`;
			case BLEConnectionState.CONNECTING:
				return "Connecting...";
			case BLEConnectionState.DISCONNECTING:
				return "Disconnecting...";
			default:
				return isScanning ? "Scanning..." : "Not connected";
		}
	};

	const getConnectionStatusIcon = () => {
		switch (connectionState) {
			case BLEConnectionState.CONNECTED:
				return checkmarkCircle;
			case BLEConnectionState.CONNECTING:
			case BLEConnectionState.DISCONNECTING:
				return ellipse;
			default:
				return closeCircle;
		}
	};

	return (
		<IonPage>
			<IonContent className="ion-padding">
				<IonCard>
					<IonCardHeader>
						<IonCardTitle>ESP32 Device</IonCardTitle>
					</IonCardHeader>
					<IonCardContent>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								marginBottom: "1rem",
							}}
						>
							<IonIcon
								icon={getConnectionStatusIcon()}
								color={getConnectionStatusColor()}
								style={{ marginRight: "0.5rem", fontSize: "1.5rem" }}
							/>
							<IonText color={getConnectionStatusColor()}>
								<p style={{ margin: 0 }}>{getConnectionStatusText()}</p>
							</IonText>
						</div>

						{isConnected && (
							<IonButton expand="block" color="danger" onClick={() => setShowDisconnectAlert(true)}>
								<IonIcon slot="start" icon={closeCircle} />
								Disconnect
							</IonButton>
						)}
					</IonCardContent>
				</IonCard>

				{/* Device List Modal */}
				{scannedDevices.length > 1 && (
					<IonCard>
						<IonCardHeader>
							<IonCardTitle>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
									}}
								>
									<span>Available Devices</span>
									{isScanning && <IonSpinner name="dots" />}
								</div>
							</IonCardTitle>
						</IonCardHeader>
						<IonCardContent>
							{scannedDevices.length === 0 && !isScanning && (
								<IonText color="medium">
									<p>
										No RSVP Readers found. Make sure your device is powered on and BLE is enabled.
									</p>
								</IonText>
							)}

							{scannedDevices.length === 0 && isScanning && (
								<IonText color="medium">
									<p>Scanning for RSVP Readers...</p>
								</IonText>
							)}

							{scannedDevices.length > 0 && (
								<IonList>
									{scannedDevices.map((device) => (
										<IonItem
											key={device.device.deviceId}
											button
											onClick={() => handleDeviceSelect(device.device.deviceId)}
										>
											<IonIcon icon={bluetooth} slot="start" />
											<IonLabel>
												<h2>{device.name}</h2>
												<p>{device.device.deviceId}</p>
											</IonLabel>
											<IonBadge slot="end" color="medium">
												{device.rssi} dBm
											</IonBadge>
										</IonItem>
									))}
								</IonList>
							)}
						</IonCardContent>
					</IonCard>
				)}

				<IonCard>
					<IonCardHeader>
						<IonCardTitle>Book Library</IonCardTitle>
					</IonCardHeader>
					<IonCardContent>
						<IonText color="medium">
							<p>No books imported yet</p>
						</IonText>
						<IonButton expand="block" className="ion-margin-top" disabled>
							<IonIcon slot="start" icon={book} />
							Import Book (Coming Soon)
						</IonButton>
					</IonCardContent>
				</IonCard>

				<div className="ion-text-center ion-margin-top">
					<IonText color="medium">
						<p>
							<small>Connect to your ESP32 RSVP Reader to sync settings and upload books</small>
						</p>
					</IonText>
				</div>

				{/* Disconnect Confirmation */}
				<IonAlert
					isOpen={showDisconnectAlert}
					onDidDismiss={() => setShowDisconnectAlert(false)}
					header="Disconnect Device"
					message="Are you sure you want to disconnect from the device?"
					buttons={[
						{
							text: "Cancel",
							role: "cancel",
						},
						{
							text: "Disconnect",
							role: "confirm",
							handler: handleDisconnect,
						},
					]}
				/>

				{/* Error Toast */}
				<IonToast
					isOpen={!!error}
					onDidDismiss={clearError}
					message={error || ""}
					duration={3000}
					color="danger"
					position="top"
				/>
			</IonContent>
		</IonPage>
	);
};

export default Home;
