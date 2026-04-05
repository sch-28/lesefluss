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
import {
	bluetooth,
	closeCircle,
	cloudDownload,
	cloudUpload,
	moonOutline,
	refresh,
	search,
	stop,
	sunnyOutline,
} from "ionicons/icons";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "../components/toast";
import { useBLE } from "../contexts/ble-context";
import { useTheme } from "../contexts/theme-context";
import { ble } from "../services/ble";
import type { StorageInfo } from "../services/ble/characteristics/storage";
import { queryHooks } from "../services/db/hooks";
import type { Settings as RSVPSettings } from "../services/db/schema";
import { log } from "../utils/log";
import { SETTING_CONSTRAINTS } from "../utils/settings";

/** Format a byte count as KB or MB, rounded to 1 decimal place. */
function formatBytes(bytes: number): string {
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
	return `${bytes} B`;
}

const Settings: React.FC = () => {
	const {
		isConnected,
		connectionState,
		connectedDevice,
		isScanning,
		startScan,
		stopScan,
		disconnect,
		syncToDevice,
		syncFromDevice,
		onConnected,
		error: bleError,
	} = useBLE();

	const { showToast } = useToast();
	const { theme, toggleTheme } = useTheme();

	// ── Data query ───────────────────────────────────────────────────────
	const { data: dbSettings, isPending } = queryHooks.useSettings();
	const saveMutation = queryHooks.useSaveSettings();

	// ── Local draft state ────────────────────────────────────────────────
	// The user edits a local draft; saving persists it to the DB.
	const [draft, setDraft] = useState<RSVPSettings | null>(null);

	// Seed draft from DB once the query resolves
	useEffect(() => {
		if (dbSettings && !draft) {
			setDraft(dbSettings);
		}
	}, [dbSettings, draft]);

	// ── BLE state ────────────────────────────────────────────────────────
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

	const updateSetting = <K extends keyof RSVPSettings>(key: K, value: RSVPSettings[K]) => {
		if (!draft) return;
		setDraft((prev) => ({ ...prev!, [key]: value }));
	};

	const handleSave = async () => {
		if (!draft) return;
		try {
			const { id, updatedAt, ...settingsToSave } = draft;
			await saveMutation.mutateAsync(settingsToSave);
			showToast("Settings saved");
		} catch (error) {
			log.error("settings", "Failed to save settings:", error);
			showToast("Failed to save settings", "danger");
		}
	};

	const handleSyncToDevice = async () => {
		if (!isConnected) {
			showToast("Not connected to device. Please connect first.", "warning");
			return;
		}

		if (!draft) return;

		try {
			setSyncing(true);

			// Save to database first
			await handleSave();

			// Sync to device
			const { id, updatedAt, ...settingsToSync } = draft;
			const success = await syncToDevice(settingsToSync);

			if (success) {
				showToast("Settings synced to device successfully");
			} else {
				showToast(bleError || "Failed to sync settings to device", "danger");
			}
		} catch (error) {
			log.error("settings", "Failed to sync to device:", error);
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
				// Update local draft
				setDraft(deviceSettings);

				// Save to database
				const { id, updatedAt, ...settingsToSave } = deviceSettings;
				await saveMutation.mutateAsync(settingsToSave);

				showToast("Settings loaded from device successfully");
			} else {
				showToast(bleError || "Failed to load settings from device", "danger");
			}
		} catch (error) {
			log.error("settings", "Failed to sync from device:", error);
			showToast("Failed to load settings from device", "danger");
		} finally {
			setSyncing(false);
		}
	};

	// Use `draft` as the render source — the user edits it locally before saving.
	const settings = draft;

	if (isPending || !settings) {
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
							<IonCardTitle>Appearance</IonCardTitle>
						</IonCardHeader>
						<IonCardContent>
							<IonItem>
								<IonIcon slot="start" icon={theme === "dark" ? moonOutline : sunnyOutline} />
								<IonLabel>Dark Mode</IonLabel>
								<IonToggle checked={theme === "dark"} onIonChange={toggleTheme} />
							</IonItem>
						</IonCardContent>
					</IonCard>

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
						</IonCardContent>
					</IonCard>

					<IonCard>
						<IonCardHeader>
							<IonCardTitle>Device Settings</IonCardTitle>
						</IonCardHeader>
						<IonCardContent>
							<IonListHeader>
								<IonLabel>Power</IonLabel>
							</IonListHeader>

							<IonItem>
								<IonLabel position="stacked">Screen off: {settings.displayOffTimeout}s</IonLabel>
								<IonRange
									min={SETTING_CONSTRAINTS.DISPLAY_OFF_TIMEOUT.min}
									max={SETTING_CONSTRAINTS.DISPLAY_OFF_TIMEOUT.max}
									step={SETTING_CONSTRAINTS.DISPLAY_OFF_TIMEOUT.step}
									value={settings.displayOffTimeout}
									onIonChange={(e) => updateSetting("displayOffTimeout", e.detail.value as number)}
									pin
									pinFormatter={(value: number) => `${value}s`}
								/>
							</IonItem>

							<IonItem>
								<IonLabel position="stacked">Shutdown: {settings.deepSleepTimeout}s</IonLabel>
								<IonRange
									min={SETTING_CONSTRAINTS.DEEP_SLEEP_TIMEOUT.min}
									max={SETTING_CONSTRAINTS.DEEP_SLEEP_TIMEOUT.max}
									step={SETTING_CONSTRAINTS.DEEP_SLEEP_TIMEOUT.step}
									value={settings.deepSleepTimeout}
									onIonChange={(e) => updateSetting("deepSleepTimeout", e.detail.value as number)}
									pin
									pinFormatter={(value: number) => `${value}s`}
								/>
							</IonItem>

							<IonListHeader>
								<IonLabel>Display</IonLabel>
							</IonListHeader>

							<IonItem>
								<IonLabel position="stacked">
									<div className="flex items-center gap-2">
										Brightness: {settings.brightness}%<IonNote>(backlight)</IonNote>
									</div>
								</IonLabel>
								<IonRange
									min={SETTING_CONSTRAINTS.BRIGHTNESS.min}
									max={SETTING_CONSTRAINTS.BRIGHTNESS.max}
									step={SETTING_CONSTRAINTS.BRIGHTNESS.step}
									value={settings.brightness}
									onIonChange={(e) => updateSetting("brightness", e.detail.value as number)}
									pin
									pinFormatter={(value: number) => `${value}%`}
								/>
							</IonItem>

							<IonItem>
								<IonLabel>Inverse Colors</IonLabel>
								<IonToggle
									checked={settings.inverse}
									onIonChange={(e) => updateSetting("inverse", e.detail.checked)}
								/>
							</IonItem>

							<IonListHeader>
								<IonLabel>Connection</IonLabel>
							</IonListHeader>

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
								<>
									<IonItem lines="none">
										{isScanning && (
											<IonSpinner name="dots" slot="start" style={{ marginRight: "0.75rem" }} />
										)}
										<IonLabel color="medium">
											<p>
												{connectionState === "connecting"
													? "Connecting..."
													: isScanning
														? "Scanning for RSVP-Reader..."
														: "Not connected"}
											</p>
										</IonLabel>
									</IonItem>
									<div className="ion-margin-top flex gap-2">
										{isScanning ? (
											<IonButton
												expand="block"
												fill="outline"
												size="small"
												className="flex-1"
												onClick={stopScan}
											>
												<IonIcon slot="start" icon={stop} />
												Stop Scan
											</IonButton>
										) : (
											<IonButton
												expand="block"
												fill="outline"
												size="small"
												className="flex-1"
												onClick={startScan}
											>
												<IonIcon slot="start" icon={search} />
												Scan
											</IonButton>
										)}
										<IonButton
											expand="block"
											fill="outline"
											size="small"
											className="flex-1"
											onClick={async () => {
												await stopScan();
												await new Promise((r) => setTimeout(r, 300));
												await startScan();
											}}
										>
											<IonIcon slot="start" icon={refresh} />
											Restart Scan
										</IonButton>
									</div>
									{bleError && (
										<IonItem lines="none">
											<IonLabel color="danger">
												<p className="text-sm">{bleError}</p>
											</IonLabel>
										</IonItem>
									)}
								</>
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
