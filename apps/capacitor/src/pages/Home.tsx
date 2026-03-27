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
import {
	bluetooth,
	book,
	checkmarkCircle,
	closeCircle,
	ellipse,
	search,
} from "ionicons/icons";
import type React from "react";
import { useEffect, useState } from "react";
import { BLEConnectionState } from "../constants/ble";
import { useBLE } from "../contexts/BLEContext";

const Home: React.FC = () => {
	const {
		isConnected,
		connectionState,
		connectedDevice,
		isScanning,
		scannedDevices,
		startScan,
		stopScan,
		connect,
		disconnect,
		error,
		clearError,
	} = useBLE();

	const [showDeviceList, setShowDeviceList] = useState(false);
	const [showDisconnectAlert, setShowDisconnectAlert] = useState(false);
	const [hasAutoScanned, setHasAutoScanned] = useState(false);
	const [hasAutoConnected, setHasAutoConnected] = useState(false);

	// Auto-scan once on mount if not connected
	useEffect(() => {
		if (!isConnected && !hasAutoScanned) {
			console.log("Auto-starting initial scan...");
			setHasAutoScanned(true);
			handleScanClick();
		}
	}, []); // Only run once on mount

	// Stop scanning when component unmounts
	useEffect(() => {
		return () => {
			if (isScanning) {
				stopScan();
			}
		};
	}, []);

	// Auto-connect if only one device found
	useEffect(() => {
		console.log(`Scanned devices changed: ${scannedDevices.length} devices`, scannedDevices);
		console.log(`Auto-connect conditions: hasAutoConnected=${hasAutoConnected}, isConnected=${isConnected}`);
		
		if (scannedDevices.length === 1 && !hasAutoConnected && !isConnected) {
			console.log("Found 1 device, auto-connecting...");
			setHasAutoConnected(true);
			handleDeviceSelect(scannedDevices[0].device.deviceId);
		} else if (scannedDevices.length > 1) {
			console.log("Found multiple devices, showing list");
			setShowDeviceList(true);
		} else {
			console.log("Not auto-connecting because:", {
				deviceCount: scannedDevices.length,
				hasAutoConnected,
				isConnected,
				shouldConnect: scannedDevices.length === 1 && !hasAutoConnected && !isConnected
			});
		}
	}, [scannedDevices]);

	const handleScanClick = async () => {
		console.log("STARTING SCANNING");
		// Reset auto-connect flag when starting a new scan
		setHasAutoConnected(false);
		await startScan();

		// Auto-stop scanning after 30 seconds
		setTimeout(() => {
			if (isScanning) {
				stopScan();
			}
		}, 30000);
	};

	const handleStopScan = async () => {
		await stopScan();
	};

	const handleDeviceSelect = async (deviceId: string) => {
		await stopScan();
		const success = await connect(deviceId);
		if (success) {
			setShowDeviceList(false);
		}
	};

	const handleDisconnect = async () => {
		await disconnect();
		setHasAutoScanned(false);
		setHasAutoConnected(false);
		setShowDisconnectAlert(false);
		// Auto-scan again after disconnect
		setTimeout(() => handleScanClick(), 1000);
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
		if (isScanning) {
			return "Scanning...";
		}
		switch (connectionState) {
			case BLEConnectionState.CONNECTED:
				return `Connected to ${connectedDevice?.name || "device"}`;
			case BLEConnectionState.CONNECTING:
				return "Connecting...";
			case BLEConnectionState.DISCONNECTING:
				return "Disconnecting...";
			default:
				return "Not connected";
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

						{!isConnected ? (
							<IonButton expand="block" onClick={handleScanClick}>
								<IonIcon slot="start" icon={bluetooth} />
								Scan for Devices
							</IonButton>
						) : (
							<IonButton
								expand="block"
								color="danger"
								onClick={() => setShowDisconnectAlert(true)}
							>
								<IonIcon slot="start" icon={closeCircle} />
								Disconnect
							</IonButton>
						)}
					</IonCardContent>
				</IonCard>

				{/* Device List Modal */}
				{showDeviceList && (
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
										No RSVP Readers found. Make sure your device is powered on
										and BLE is enabled.
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

							<div
								style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}
							>
								{isScanning ? (
									<IonButton expand="block" onClick={handleStopScan}>
										<IonIcon slot="start" icon={closeCircle} />
										Stop Scanning
									</IonButton>
								) : (
									<>
										<IonButton expand="block" onClick={handleScanClick}>
											<IonIcon slot="start" icon={search} />
											Rescan
										</IonButton>
										<IonButton
											expand="block"
											fill="outline"
											onClick={() => setShowDeviceList(false)}
										>
											Cancel
										</IonButton>
									</>
								)}
							</div>
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
							<small>
								Connect to your ESP32 RSVP Reader to sync settings and upload
								books
							</small>
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
				/>
			</IonContent>
		</IonPage>
	);
};

export default Home;
