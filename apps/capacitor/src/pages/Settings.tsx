import {
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
	IonRange,
	IonSpinner,
	IonText,
	IonTitle,
	IonToast,
	IonToggle,
	IonToolbar,
} from "@ionic/react";
import { bluetooth, cloudDownload, cloudUpload } from "ionicons/icons";
import type React from "react";
import { useEffect, useState } from "react";
import { SETTING_CONSTRAINTS } from "../constants/settings";
import { useBLE } from "../contexts/BLEContext";
import { useDatabase } from "../contexts/DatabaseContext";
import { db, type RSVPSettings } from "../services/database";

const Settings: React.FC = () => {
	const { isReady } = useDatabase();
	const {
		isConnected,
		syncToDevice,
		syncFromDevice,
		error: bleError,
	} = useBLE();

	const [loading, setLoading] = useState(true);
	const [syncing, setSyncing] = useState(false);
	const [toast, setToast] = useState<{
		show: boolean;
		message: string;
		color?: string;
	}>({
		show: false,
		message: "",
	});

	const [settings, setSettings] = useState<RSVPSettings | null>({
		delayComma: 1,
		devMode: false,
		accelRate: 2,
		accelStart: 2,
		bleOn: false,
		currentSlot: 0,
		delayPeriod: 2,
		inverse: false,
		wordOffset: 2,
		wpm: 200,
		xOffset: 2,
	});

	// Load settings from database on mount
	useEffect(() => {
		if (isReady) {
			loadSettings();
		}
	}, [isReady]);

	const loadSettings = async () => {
		try {
			const dbSettings = await db.getSettings();
			setSettings(dbSettings);
			setLoading(false);
		} catch (error) {
			console.error("Failed to load settings:", error);
			setToast({
				show: true,
				message: "Failed to load settings",
				color: "danger",
			});
			setLoading(false);
		}
	};

	const updateSetting = <K extends keyof RSVPSettings>(
		key: K,
		value: RSVPSettings[K],
	) => {
		if (!settings) return;
		setSettings((prev) => ({ ...prev!, [key]: value }));
	};

	const handleSave = async () => {
		if (!settings) return;
		try {
			const { id, updatedAt, ...settingsToSave } = settings;
			await db.saveSettings(settingsToSave);
			setToast({
				show: true,
				message: "Settings saved",
				color: "success",
			});
		} catch (error) {
			console.error("Failed to save settings:", error);
			setToast({
				show: true,
				message: "Failed to save settings",
				color: "danger",
			});
		}
	};

	const handleSyncToDevice = async () => {
		if (!isConnected) {
			setToast({
				show: true,
				message: "Not connected to device. Please connect first.",
				color: "warning",
			});
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
				setToast({
					show: true,
					message: "Settings synced to device successfully",
					color: "success",
				});
			} else {
				setToast({
					show: true,
					message: bleError || "Failed to sync settings to device",
					color: "danger",
				});
			}
		} catch (error) {
			console.error("Failed to sync to device:", error);
			setToast({
				show: true,
				message: "Failed to sync settings to device",
				color: "danger",
			});
		} finally {
			setSyncing(false);
		}
	};

	const handleSyncFromDevice = async () => {
		if (!isConnected) {
			setToast({
				show: true,
				message: "Not connected to device. Please connect first.",
				color: "warning",
			});
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
				await db.saveSettings(settingsToSave);

				setToast({
					show: true,
					message: "Settings loaded from device successfully",
					color: "success",
				});
			} else {
				setToast({
					show: true,
					message: bleError || "Failed to load settings from device",
					color: "danger",
				});
			}
		} catch (error) {
			console.error("Failed to sync from device:", error);
			setToast({
				show: true,
				message: "Failed to load settings from device",
				color: "danger",
			});
		} finally {
			setSyncing(false);
		}
	};

	if (loading || !settings) {
		return (
			<IonPage>
				<IonHeader>
					<IonToolbar>
						<IonTitle>RSVP Settings</IonTitle>
					</IonToolbar>
				</IonHeader>
				<IonContent className="ion-padding ion-text-center">
					<IonSpinner />
					<p>Loading settings...</p>
				</IonContent>
			</IonPage>
		);
	}

	return (
		<IonPage>
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
								<IonLabel position="stacked">
									Words Per Minute: {settings.wpm}
								</IonLabel>
								<IonRange
									min={SETTING_CONSTRAINTS.WPM.min}
									max={SETTING_CONSTRAINTS.WPM.max}
									step={SETTING_CONSTRAINTS.WPM.step}
									value={settings.wpm}
									onIonChange={(e) =>
										updateSetting("wpm", e.detail.value as number)
									}
									pin
									pinFormatter={(value: number) => `${value} WPM`}
								/>
							</IonItem>

							<IonListHeader>
								<IonLabel>Punctuation Delays</IonLabel>
							</IonListHeader>

							<IonItem>
								<IonLabel position="stacked">
									<div className="flex gap-2 items-center">
										Comma Delay: {settings.delayComma.toFixed(1)}x
										<IonNote>(, ; :)</IonNote>
									</div>
								</IonLabel>
								<IonRange
									min={1.0}
									max={5.0}
									step={0.1}
									value={settings.delayComma}
									onIonChange={(e) =>
										updateSetting("delayComma", e.detail.value as number)
									}
									pin
									pinFormatter={(value: number) => `${value.toFixed(1)}x`}
								/>
							</IonItem>

							<IonItem>
								<IonLabel position="stacked">
									<div className="flex gap-2 items-center">
										Period Delay: {settings.delayPeriod.toFixed(1)}x
										<IonNote>(. ! ?)</IonNote>
									</div>
								</IonLabel>
								<IonRange
									min={1.0}
									max={5.0}
									step={0.1}
									value={settings.delayPeriod}
									onIonChange={(e) =>
										updateSetting("delayPeriod", e.detail.value as number)
									}
									pin
									pinFormatter={(value: number) => `${value.toFixed(1)}x`}
								/>
							</IonItem>

							<IonListHeader>
								<IonLabel>Acceleration</IonLabel>
							</IonListHeader>

							<IonItem>
								<IonLabel position="stacked">
									<div className="flex gap-2 items-center">
										Start Speed: {settings.accelStart.toFixed(1)}x
										<IonNote>(ease-in)</IonNote>
									</div>
								</IonLabel>
								<IonRange
									min={1.0}
									max={5.0}
									step={0.1}
									value={settings.accelStart}
									onIonChange={(e) =>
										updateSetting("accelStart", e.detail.value as number)
									}
									pin
									pinFormatter={(value: number) => `${value.toFixed(1)}x`}
								/>
							</IonItem>

							<IonItem>
								<IonLabel position="stacked">
									<div className="flex gap-2 items-center">
										Acceleration Rate: {settings.accelRate.toFixed(2)}
										<IonNote>(ramp to full speed)</IonNote>
									</div>
								</IonLabel>
								<IonRange
									min={0.05}
									max={1.0}
									step={0.05}
									value={settings.accelRate}
									onIonChange={(e) =>
										updateSetting("accelRate", e.detail.value as number)
									}
									pin
									pinFormatter={(value: number) => value.toFixed(2)}
								/>
							</IonItem>

							<IonListHeader>
								<IonLabel>Display</IonLabel>
							</IonListHeader>

							<IonItem>
								<IonLabel position="stacked">
									<div className="flex gap-2 items-center">
										Focal Offset: {settings.xOffset}%
										<IonNote>(30=left, 50=center, 70=right)</IonNote>
									</div>
								</IonLabel>
								<IonRange
									min={30}
									max={70}
									step={5}
									value={settings.xOffset}
									onIonChange={(e) =>
										updateSetting("xOffset", e.detail.value as number)
									}
									pin
									pinFormatter={(value: number) => `${value}%`}
								/>
							</IonItem>

							<IonItem>
								<IonLabel position="stacked">
									<div className="flex gap-2 items-center">
										Word Offset: {settings.wordOffset}
										<IonNote>(rewind on resume)</IonNote>
									</div>
								</IonLabel>
								<IonRange
									min={0}
									max={20}
									step={1}
									value={settings.wordOffset}
									onIonChange={(e) =>
										updateSetting("wordOffset", e.detail.value as number)
									}
									pin
									pinFormatter={(value: number) => `${value} words`}
								/>
							</IonItem>

							<IonItem>
								<IonLabel>Inverse Colors</IonLabel>
								<IonToggle
									checked={settings.inverse}
									onIonChange={(e) =>
										updateSetting("inverse", e.detail.checked)
									}
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
									onIonChange={(e) =>
										updateSetting("devMode", e.detail.checked)
									}
								/>
							</IonItem>
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
							<div className="flex gap-2 items-center justify-center">
								<IonIcon icon={bluetooth} color="medium" />
								<IonText color="medium">
									<p className="text-sm">Connect to the RSVP-Reader to sync</p>
								</IonText>
							</div>
						)}
					</div>
				</IonToolbar>
			</IonFooter>
		</IonPage>
	);
};

export default Settings;
