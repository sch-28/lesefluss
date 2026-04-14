import {
	IonAlert,
	IonBackButton,
	IonButton,
	IonButtons,
	IonContent,
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
	refresh,
	search,
	stop,
} from "ionicons/icons";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "../../components/toast";
import { useBLE } from "../../contexts/ble-context";
import { useSettingsDraft } from "../../hooks/use-settings-draft";
import { ble } from "../../services/ble";
import type { StorageInfo } from "../../services/ble/characteristics/storage";
import { log } from "../../utils/log";
import { SETTING_CONSTRAINTS } from "@rsvp/rsvp-core";

function formatBytes(bytes: number): string {
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
	return `${bytes} B`;
}

const DeviceSettings: React.FC = () => {
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
	const { draft, setDraft, updateSetting, handleSave, saveMutation, isPending } =
		useSettingsDraft();

	const [syncing, setSyncing] = useState(false);
	const [showDisconnectAlert, setShowDisconnectAlert] = useState(false);
	const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

	const fetchStorageRef = useRef<(() => Promise<void>) | undefined>(undefined);

	const fetchStorage = async () => {
		const result = await ble.readStorage();
		if (result.success && result.data) {
			setStorageInfo(result.data);
		}
	};

	fetchStorageRef.current = fetchStorage;

	useEffect(() => {
		onConnected(() => {
			fetchStorageRef.current?.();
		});
	}, [onConnected]);

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

	const handleSyncToDevice = async () => {
		if (!isConnected || !draft) return;
		try {
			setSyncing(true);
			await handleSave();
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
		if (!isConnected) return;
		try {
			setSyncing(true);
			const deviceSettings = await syncFromDevice();
			if (deviceSettings) {
				setDraft(deviceSettings);
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

	if (isPending || !draft) {
		return (
			<IonPage>
				<IonContent className="ion-padding ion-text-center">
					<IonSpinner />
				</IonContent>
			</IonPage>
		);
	}

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/settings" />
					</IonButtons>
					<IonTitle>Device</IonTitle>
				</IonToolbar>
			</IonHeader>
			<IonContent className="ion-padding">
				<IonList>
					<IonListHeader>
						<IonLabel>Display</IonLabel>
					</IonListHeader>

					<IonItem>
						<IonLabel position="stacked">
							<div className="flex items-center gap-2">
								Brightness: {draft.brightness}%<IonNote>(backlight)</IonNote>
							</div>
						</IonLabel>
						<IonRange
							min={SETTING_CONSTRAINTS.BRIGHTNESS.min}
							max={SETTING_CONSTRAINTS.BRIGHTNESS.max}
							step={SETTING_CONSTRAINTS.BRIGHTNESS.step}
							value={draft.brightness}
							onIonChange={(e) => updateSetting("brightness", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => `${value}%`}
						/>
					</IonItem>

					<IonItem>
						<IonLabel>Inverse Colors</IonLabel>
						<IonToggle
							checked={draft.inverse}
							onIonChange={(e) => updateSetting("inverse", e.detail.checked)}
						/>
					</IonItem>

					<IonListHeader>
						<IonLabel>Power</IonLabel>
					</IonListHeader>

					<IonItem>
						<IonLabel position="stacked">Screen off: {draft.displayOffTimeout}s</IonLabel>
						<IonRange
							min={SETTING_CONSTRAINTS.DISPLAY_OFF_TIMEOUT.min}
							max={SETTING_CONSTRAINTS.DISPLAY_OFF_TIMEOUT.max}
							step={SETTING_CONSTRAINTS.DISPLAY_OFF_TIMEOUT.step}
							value={draft.displayOffTimeout}
							onIonChange={(e) => updateSetting("displayOffTimeout", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => `${value}s`}
						/>
					</IonItem>

					<IonItem>
						<IonLabel position="stacked">Shutdown: {draft.deepSleepTimeout}s</IonLabel>
						<IonRange
							min={SETTING_CONSTRAINTS.DEEP_SLEEP_TIMEOUT.min}
							max={SETTING_CONSTRAINTS.DEEP_SLEEP_TIMEOUT.max}
							step={SETTING_CONSTRAINTS.DEEP_SLEEP_TIMEOUT.step}
							value={draft.deepSleepTimeout}
							onIonChange={(e) => updateSetting("deepSleepTimeout", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => `${value}s`}
						/>
					</IonItem>

					<IonListHeader>
						<IonLabel>Developer</IonLabel>
					</IonListHeader>

					<IonItem>
						<IonLabel>Dev Mode</IonLabel>
						<IonToggle
							checked={draft.devMode}
							onIonChange={(e) => updateSetting("devMode", e.detail.checked)}
						/>
					</IonItem>

					<IonListHeader>
						<IonLabel>Connection</IonLabel>
					</IonListHeader>

					{isConnected && connectedDevice && (
						<>
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
				</IonList>

				<div className="ion-padding">
					<IonButton expand="block" onClick={handleSave}>
						Save Settings
					</IonButton>
					<div className="ion-margin-top flex gap-2">
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
						<div className="ion-margin-top flex items-center justify-center gap-2">
							<IonIcon icon={bluetooth} color="medium" />
							<IonText color="medium">
								<p className="text-sm">Connect to the RSVP-Reader to sync</p>
							</IonText>
						</div>
					)}
				</div>
			</IonContent>

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

export default DeviceSettings;
