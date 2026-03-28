import {
	IonAlert,
	IonButton,
	IonCard,
	IonCardContent,
	IonCardHeader,
	IonCardTitle,
	IonContent,
	IonFooter,
	IonHeader,
	IonIcon,
	IonItem,
	IonLabel,
	IonList,
	IonListHeader,
	IonNote,
	IonPage,
	IonProgressBar,
	IonRange,
	IonSpinner,
	IonText,
	IonTitle,
	IonToggle,
	IonToolbar,
} from "@ionic/react";
import { bluetooth, closeCircle, cloudDownload, cloudUpload } from "ionicons/icons";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { ble } from "../ble";
import type { StorageInfo } from "../ble/characteristics/storage";
import { useToast } from "../components/toast";
import { SETTING_CONSTRAINTS } from "../constants/settings";
import { useBLE } from "../contexts/BLEContext";
import { useDatabase } from "../contexts/DatabaseContext";
import { queries } from "../db/queries";
import type { Settings as RSVPSettings } from "../db/schema";

/** Format a byte count as KB or MB, rounded to 1 decimal place. */
function formatBytes(bytes: number): string {
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
	return `${bytes} B`;
}

const Settings: React.FC = () => {
	const { isReady } = useDatabase();
	const {
		isConnected,
		connectedDevice,
		isScanning,
		startScan,
		disconnect,
		syncToDevice,
		syncFromDevice,
		onConnected,
		error: bleError,
	} = useBLE();

	const { showToast } = useToast();
	const [loading, setLoading] = useState(true);
	const [syncing, setSyncing] = useState(false);
	const [showDisconnectAlert, setShowDisconnectAlert] = useState(false);
	const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

	// Keep a ref so the onConnected callback always sees the latest fetch function
	const fetchStorageRef = useRef<(() => Promise<void>) | undefined>(undefined);

	const fetchStorage = async () => {
		const result = await ble.readStorage();
		if (result.success && result.data) {
			setStorageInfo(result.data);
		}
	};

	// Store the latest fetchStorage in a ref (avoids stale closure in the callback)
	fetchStorageRef.current = fetchStorage;

	// Register post-connect hook so storage is fetched on every new connection
	useEffect(() => {
		onConnected(() => {
			fetchStorageRef.current?.();
		});
	}, [onConnected]);

	// Fetch storage immediately if we're already connected when this page mounts
	useEffect(() => {
		if (isConnected) {
			fetchStorage();
		} else {
			setStorageInfo(null);
		}
	}, [isConnected]);

	const handleDisconnect = async () => {
		await disconnect();
		setShowDisconnectAlert(false);
		showToast("Disconnected from device");
	};

	const [settings, setSettings] = useState<RSVPSettings | null>(null);

	// Load settings from database on mount
	useEffect(() => {
		if (isReady) {
			loadSettings();
		}
	}, [isReady]);

	const loadSettings = async () => {
		try {
			const dbSettings = await queries.getSettings();
			setSettings(dbSettings);
			setLoading(false);
		} catch (error) {
			console.error("Failed to load settings:", error);
			showToast("Failed to load settings", "danger");
			setLoading(false);
		}
	};

	const updateSetting = <K extends keyof RSVPSettings>(key: K, value: RSVPSettings[K]) => {
		if (!settings) return;
		setSettings((prev) => ({ ...prev!, [key]: value }));
	};

	const handleSave = async () => {
		if (!settings) return;
		try {
			const { id, updatedAt, ...settingsToSave } = settings;
			await queries.saveSettings(settingsToSave);
			showToast("Settings saved");
		} catch (error) {
			console.error("Failed to save settings:", error);
			showToast("Failed to save settings", "danger");
		}
	};

	const handleSyncToDevice = async () => {
		if (!isConnected) {
			showToast("Not connected to device. Please connect first.", "warning");
			return;
		}

		if (!settings) return;

		try {
			setSyncing(true);

			// Save to database first
			await handleSave();

			// Sync to device
			const { id, updatedAt, ...settingsToSync } = settings;
			const success = await syncToDevice(settingsToSync);

			if (success) {
				showToast("Settings synced to device successfully");
			} else {
				showToast(bleError || "Failed to sync settings to device", "danger");
			}
		} catch (error) {
			console.error("Failed to sync to device:", error);
			showToast("Failed to sync settings to device", "danger");
		} finally {
			setSyncing(false);
		}
	};

	const handleSyncFromDevice = async () => {
		if (!isConnected) {
			showToast("Not connected to device. Please connect first.", "warning");
			return;
		}

		try {
			setSyncing(true);

			// Read from device
			const deviceSettings = await syncFromDevice();

			if (deviceSettings) {
				// Update local state
				setSettings(deviceSettings);

				// Save to database
				const { id, updatedAt, ...settingsToSave } = deviceSettings;
				await queries.saveSettings(settingsToSave);

				showToast("Settings loaded from device successfully");
			} else {
				showToast(bleError || "Failed to load settings from device", "danger");
			}
		} catch (error) {
			console.error("Failed to sync from device:", error);
			showToast("Failed to load settings from device", "danger");
		} finally {
			setSyncing(false);
		}
	};

	if (loading || !settings) {
		return (
			<IonPage>
				<IonContent className="ion-padding ion-text-center">
					<IonSpinner />
					<p>Loading settings...</p>
				</IonContent>
			</IonPage>
		);
	}

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonTitle>Settings</IonTitle>
				</IonToolbar>
			</IonHeader>
			<IonContent className="ion-padding">
				<IonList>
					<IonCard>
						<IonCardHeader>
							<IonCardTitle>General</IonCardTitle>
						</IonCardHeader>
						<IonCardContent>
							<IonListHeader>
								<IonLabel>Reading Speed</IonLabel>
							</IonListHeader>

							<IonItem>
								<IonLabel position="stacked">Words Per Minute: {settings.wpm}</IonLabel>
								<IonRange
									min={SETTING_CONSTRAINTS.WPM.min}
									max={SETTING_CONSTRAINTS.WPM.max}
									step={SETTING_CONSTRAINTS.WPM.step}
									value={settings.wpm}
									onIonChange={(e) => updateSetting("wpm", e.detail.value as number)}
									pin
									pinFormatter={(value: number) => `${value} WPM`}
								/>
							</IonItem>

							<IonListHeader>
								<IonLabel>Punctuation Delays</IonLabel>
							</IonListHeader>

							<IonItem>
								<IonLabel position="stacked">
									<div className="flex items-center gap-2">
										Comma Delay: {settings.delayComma.toFixed(1)}x<IonNote>(, ; :)</IonNote>
									</div>
								</IonLabel>
								<IonRange
									min={1.0}
									max={5.0}
									step={0.1}
									value={settings.delayComma}
									onIonChange={(e) => updateSetting("delayComma", e.detail.value as number)}
									pin
									pinFormatter={(value: number) => `${value.toFixed(1)}x`}
								/>
							</IonItem>

							<IonItem>
								<IonLabel position="stacked">
									<div className="flex items-center gap-2">
										Period Delay: {settings.delayPeriod.toFixed(1)}x<IonNote>(. ! ?)</IonNote>
									</div>
								</IonLabel>
								<IonRange
									min={1.0}
									max={5.0}
									step={0.1}
									value={settings.delayPeriod}
									onIonChange={(e) => updateSetting("delayPeriod", e.detail.value as number)}
									pin
									pinFormatter={(value: number) => `${value.toFixed(1)}x`}
								/>
							</IonItem>

							<IonListHeader>
								<IonLabel>Acceleration</IonLabel>
							</IonListHeader>

							<IonItem>
								<IonLabel position="stacked">
									<div className="flex items-center gap-2">
										Start Speed: {settings.accelStart.toFixed(1)}x<IonNote>(ease-in)</IonNote>
									</div>
								</IonLabel>
								<IonRange
									min={1.0}
									max={5.0}
									step={0.1}
									value={settings.accelStart}
									onIonChange={(e) => updateSetting("accelStart", e.detail.value as number)}
									pin
									pinFormatter={(value: number) => `${value.toFixed(1)}x`}
								/>
							</IonItem>

							<IonItem>
								<IonLabel position="stacked">
									<div className="flex items-center gap-2">
										Acceleration Rate: {settings.accelRate.toFixed(2)}
										<IonNote>(ramp to full speed)</IonNote>
									</div>
								</IonLabel>
								<IonRange
									min={0.05}
									max={1.0}
									step={0.05}
									value={settings.accelRate}
									onIonChange={(e) => updateSetting("accelRate", e.detail.value as number)}
									pin
									pinFormatter={(value: number) => value.toFixed(2)}
								/>
							</IonItem>

							<IonListHeader>
								<IonLabel>Display</IonLabel>
							</IonListHeader>

							<IonItem>
								<IonLabel position="stacked">
									<div className="flex items-center gap-2">
										Focal Offset: {settings.xOffset}%
										<IonNote>(30=left, 50=center, 70=right)</IonNote>
									</div>
								</IonLabel>
								<IonRange
									min={30}
									max={70}
									step={5}
									value={settings.xOffset}
									onIonChange={(e) => updateSetting("xOffset", e.detail.value as number)}
									pin
									pinFormatter={(value: number) => `${value}%`}
								/>
							</IonItem>

							<IonItem>
								<IonLabel position="stacked">
									<div className="flex items-center gap-2">
										Word Offset: {settings.wordOffset}
										<IonNote>(rewind on resume)</IonNote>
									</div>
								</IonLabel>
								<IonRange
									min={0}
									max={20}
									step={1}
									value={settings.wordOffset}
									onIonChange={(e) => updateSetting("wordOffset", e.detail.value as number)}
									pin
									pinFormatter={(value: number) => `${value} words`}
								/>
							</IonItem>

							<IonItem>
								<IonLabel>Inverse Colors</IonLabel>
								<IonToggle
									checked={settings.inverse}
									onIonChange={(e) => updateSetting("inverse", e.detail.checked)}
								/>
							</IonItem>
						</IonCardContent>
					</IonCard>

					<IonCard>
						<IonCardHeader>
							<IonCardTitle>Device Settings</IonCardTitle>
						</IonCardHeader>
						<IonCardContent>
							<IonListHeader>
								<IonLabel>Connection</IonLabel>
							</IonListHeader>

							<IonItem>
								<IonLabel>BLE Enabled</IonLabel>
								<IonToggle
									checked={settings.bleOn}
									onIonChange={(e) => updateSetting("bleOn", e.detail.checked)}
								/>
							</IonItem>
							<IonItem>
								<IonLabel>Dev Mode</IonLabel>
								<IonToggle
									checked={settings.devMode}
									onIonChange={(e) => updateSetting("devMode", e.detail.checked)}
								/>
							</IonItem>

							{isConnected && connectedDevice && (
								<>
									<IonListHeader>
										<IonLabel>Connected Device</IonLabel>
									</IonListHeader>
									<IonItem>
										<IonIcon icon={bluetooth} slot="start" />
										<IonLabel>
											<h2>{connectedDevice.name || "RSVP-Reader"}</h2>
											<p>{connectedDevice.deviceId}</p>
										</IonLabel>
									</IonItem>
									{storageInfo && (
										<IonItem>
											<IonLabel>
												<h2>Storage</h2>
												<IonProgressBar
													value={
														storageInfo.total_bytes > 0
															? (storageInfo.total_bytes - storageInfo.free_bytes) /
																storageInfo.total_bytes
															: 0
													}
													style={{ margin: "6px 0" }}
												/>
												<p>
													{formatBytes(storageInfo.free_bytes)} free of{" "}
													{formatBytes(storageInfo.total_bytes)}
												</p>
											</IonLabel>
										</IonItem>
									)}
									<IonButton
										expand="block"
										fill="outline"
										color="danger"
										className="ion-margin-top"
										onClick={() => setShowDisconnectAlert(true)}
									>
										<IonIcon slot="start" icon={closeCircle} />
										Disconnect
									</IonButton>
								</>
							)}

							{!isConnected && (
								<IonItem lines="none" style={{ marginTop: "0.5rem" }}>
									{isScanning && (
										<IonSpinner name="dots" slot="start" style={{ marginRight: "0.75rem" }} />
									)}
									<IonLabel color="medium">
										<p>{isScanning ? "Scanning for RSVP-Reader..." : "Not scanning"}</p>
									</IonLabel>
									{!isScanning && !isConnected && (
										<IonButton
											size="small"
											fill="outline"
											onClick={startScan}
											disabled={isConnected}
										>
											Scan
										</IonButton>
									)}
								</IonItem>
							)}
						</IonCardContent>
					</IonCard>
				</IonList>
			</IonContent>

			<IonFooter>
				<IonToolbar>
					<div className="flex flex-col gap-2 px-4 py-2">
						<IonButton expand="block" onClick={handleSave}>
							Save Settings
						</IonButton>
						<div className="flex gap-2">
							<IonButton
								expand="block"
								fill="outline"
								className="flex-1"
								onClick={handleSyncToDevice}
								disabled={!isConnected || syncing}
							>
								{syncing ? (
									<IonSpinner name="crescent" slot="start" />
								) : (
									<IonIcon slot="start" icon={cloudUpload} />
								)}
								Sync to Device
							</IonButton>

							<IonButton
								expand="block"
								fill="outline"
								className="flex-1"
								onClick={handleSyncFromDevice}
								disabled={!isConnected || syncing}
							>
								{syncing ? (
									<IonSpinner name="crescent" slot="start" />
								) : (
									<IonIcon slot="start" icon={cloudDownload} />
								)}
								Load from Device
							</IonButton>
						</div>
						{!isConnected && (
							<div className="flex items-center justify-center gap-2">
								<IonIcon icon={bluetooth} color="medium" />
								<IonText color="medium">
									<p className="text-sm">Connect to the RSVP-Reader to sync</p>
								</IonText>
							</div>
						)}
					</div>
				</IonToolbar>
			</IonFooter>

			<IonAlert
				isOpen={showDisconnectAlert}
				onDidDismiss={() => setShowDisconnectAlert(false)}
				header="Disconnect Device"
				message={`Disconnect from ${connectedDevice?.name || "the device"}?`}
				buttons={[
					{ text: "Cancel", role: "cancel" },
					{ text: "Disconnect", role: "confirm", handler: handleDisconnect },
				]}
			/>
		</IonPage>
	);
};

export default Settings;
