import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import {
	Bluetooth,
	CircleX,
	CloudDownload,
	CloudUpload,
	Cpu,
	Loader2,
	RefreshCw,
	Search,
	Square,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@lesefluss/ui/alert-dialog";
import { Button } from "@lesefluss/ui/button";
import { Progress } from "@lesefluss/ui/progress";
import { Slider } from "@lesefluss/ui/slider";
import { Switch } from "@lesefluss/ui/switch";
import { PageHeader } from "@/components/app-shell/page-header";
import { DeviceSync } from "@/components/device-sync";
import { useToast } from "@/components/toast";
import { useBLE } from "@/contexts/ble-context";
import { useAutoSaveSettings } from "@/hooks/use-auto-save-settings";
import { ble } from "@/services/ble";
import type { StorageInfo } from "@/services/ble/characteristics/storage";
import { MULTI_BOOK_DESCRIPTOR_ID } from "@/services/devices";
import { log } from "@/utils/log";

export const Route = createFileRoute("/tabs/settings/device")({
	component: DeviceSettings,
});

function formatBytes(bytes: number): string {
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
	return `${bytes} B`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="mt-6 first:mt-2">
			<h2 className="px-4 pb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
				{title}
			</h2>
			<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
				{children}
			</div>
		</section>
	);
}

function ToggleRow({
	title,
	subtitle,
	checked,
	onCheckedChange,
}: {
	title: string;
	subtitle?: string;
	checked: boolean;
	onCheckedChange: (v: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-3 px-4 py-3">
			<div className="min-w-0">
				<div className="font-medium text-foreground text-sm">{title}</div>
				{subtitle && <div className="text-muted-foreground text-xs">{subtitle}</div>}
			</div>
			<Switch checked={checked} onCheckedChange={onCheckedChange} />
		</div>
	);
}

function SliderRow({
	title,
	value,
	displayValue,
	min,
	max,
	step,
	onChange,
}: {
	title: string;
	value: number;
	displayValue: string;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
}) {
	return (
		<div className="space-y-2 px-4 py-3">
			<div className="flex items-center justify-between">
				<div className="font-medium text-foreground text-sm">{title}</div>
				<div className="font-mono text-muted-foreground text-sm tabular-nums">{displayValue}</div>
			</div>
			<Slider
				min={min}
				max={max}
				step={step}
				value={[value]}
				onValueChange={(v) => onChange(v[0] ?? value)}
			/>
		</div>
	);
}

function DeviceSettings() {
	const {
		isConnected,
		connectionState,
		connectedDevice,
		isScanning,
		bleEnabled,
		toggleBLEEnabled,
		startScan,
		stopScan,
		disconnect,
		syncToDevice,
		syncFromDevice,
		onConnected,
		connectedDescriptorId,
		error: bleError,
	} = useBLE();

	const { showToast } = useToast();
	const { settings, updateSetting, flush, replaceAll, isPending } = useAutoSaveSettings();

	const [syncing, setSyncing] = useState(false);
	const [showDisconnectAlert, setShowDisconnectAlert] = useState(false);
	const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

	const fetchStorageRef = useRef<(() => Promise<void>) | undefined>(undefined);

	const fetchStorage = useCallback(async () => {
		const result = await ble.readStorage();
		if (result.success && result.data) {
			setStorageInfo(result.data);
		}
	}, []);

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
	}, [isConnected, fetchStorage]);

	const handleDisconnect = async () => {
		await disconnect();
		setShowDisconnectAlert(false);
		showToast("Disconnected from device");
	};

	const handleSyncToDevice = async () => {
		if (!isConnected || !settings) return;
		try {
			setSyncing(true);
			await flush();
			const { id, updatedAt, ...settingsToSync } = settings;
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
				const { id, updatedAt, ...settingsToSave } = deviceSettings;
				await replaceAll(settingsToSave);
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

	if (isPending || !settings) {
		return (
			<div className="bg-background">
				<PageHeader title="Device" icon={Cpu} />
				<div className="flex items-center justify-center py-20">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			</div>
		);
	}

	const isMultiBookConnected =
		isConnected && connectedDescriptorId === MULTI_BOOK_DESCRIPTOR_ID;

	const storageUsedPct =
		storageInfo && storageInfo.total_bytes > 0
			? ((storageInfo.total_bytes - storageInfo.free_bytes) / storageInfo.total_bytes) * 100
			: 0;

	return (
		<div className="bg-background">
			<PageHeader title="Device" icon={Cpu} />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				{isMultiBookConnected && connectedDescriptorId && (
					<DeviceSync descriptorId={connectedDescriptorId} />
				)}
				<Section title="Display">
					<SliderRow
						title="Brightness"
						value={settings.brightness}
						displayValue={`${settings.brightness}%`}
						min={SETTING_CONSTRAINTS.BRIGHTNESS.min}
						max={SETTING_CONSTRAINTS.BRIGHTNESS.max}
						step={SETTING_CONSTRAINTS.BRIGHTNESS.step}
						onChange={(v) => updateSetting("brightness", v)}
					/>
					<ToggleRow
						title="Inverse colors"
						checked={settings.inverse}
						onCheckedChange={(v) => updateSetting("inverse", v)}
					/>
				</Section>

				<Section title="Power">
					<SliderRow
						title="Screen off"
						value={settings.displayOffTimeout}
						displayValue={`${settings.displayOffTimeout}s`}
						min={SETTING_CONSTRAINTS.DISPLAY_OFF_TIMEOUT.min}
						max={SETTING_CONSTRAINTS.DISPLAY_OFF_TIMEOUT.max}
						step={SETTING_CONSTRAINTS.DISPLAY_OFF_TIMEOUT.step}
						onChange={(v) => updateSetting("displayOffTimeout", v)}
					/>
					<SliderRow
						title="Shutdown"
						value={settings.deepSleepTimeout}
						displayValue={`${settings.deepSleepTimeout}s`}
						min={SETTING_CONSTRAINTS.DEEP_SLEEP_TIMEOUT.min}
						max={SETTING_CONSTRAINTS.DEEP_SLEEP_TIMEOUT.max}
						step={SETTING_CONSTRAINTS.DEEP_SLEEP_TIMEOUT.step}
						onChange={(v) => updateSetting("deepSleepTimeout", v)}
					/>
				</Section>

				<Section title="Developer">
					<ToggleRow
						title="Dev mode"
						checked={settings.devMode}
						onCheckedChange={(v) => updateSetting("devMode", v)}
					/>
				</Section>

				<Section title="Connection">
					<ToggleRow
						title="Enable Bluetooth"
						subtitle="Required to connect to Lesefluss"
						checked={bleEnabled}
						onCheckedChange={() => toggleBLEEnabled()}
					/>
					{isConnected && connectedDevice && (
						<>
							<div className="flex items-center gap-3 px-4 py-3">
								<Bluetooth className="size-5 text-primary" />
								<div className="flex-1">
									<div className="font-medium text-foreground text-sm">
										{connectedDevice.name || "Lesefluss"}
									</div>
									<div className="text-muted-foreground text-xs">{connectedDevice.deviceId}</div>
								</div>
							</div>
							{storageInfo && (
								<div className="space-y-2 px-4 py-3">
									<div className="font-medium text-foreground text-sm">Storage</div>
									<Progress value={storageUsedPct} />
									<div className="text-muted-foreground text-xs">
										{formatBytes(storageInfo.free_bytes)} free of{" "}
										{formatBytes(storageInfo.total_bytes)}
									</div>
								</div>
							)}
							<div className="p-3">
								<Button
									variant="outline"
									className="w-full text-destructive"
									onClick={() => setShowDisconnectAlert(true)}
								>
									<CircleX />
									Disconnect
								</Button>
							</div>
						</>
					)}
					{bleEnabled && !isConnected && (
						<>
							<div className="flex items-center gap-3 px-4 py-3 text-muted-foreground text-sm">
								{isScanning && <Loader2 className="size-4 animate-spin" />}
								<span>
									{connectionState === "connecting"
										? "Connecting..."
										: isScanning
											? "Scanning for Lesefluss..."
											: "Not connected"}
								</span>
							</div>
							<div className="flex gap-2 p-3">
								{isScanning ? (
									<Button variant="outline" className="flex-1" onClick={stopScan}>
										<Square />
										Stop scan
									</Button>
								) : (
									<Button variant="outline" className="flex-1" onClick={startScan}>
										<Search />
										Scan
									</Button>
								)}
								<Button
									variant="outline"
									className="flex-1"
									onClick={async () => {
										await stopScan();
										await new Promise((r) => setTimeout(r, 300));
										await startScan();
									}}
								>
									<RefreshCw />
									Restart scan
								</Button>
							</div>
							{bleError && (
								<div className="px-4 py-2 text-destructive text-sm">{bleError}</div>
							)}
						</>
					)}
				</Section>

				<div className="mt-6 space-y-3">
					<div className="flex gap-2">
						<Button
							variant="outline"
							className="flex-1"
							onClick={handleSyncToDevice}
							disabled={!isConnected || syncing}
						>
							{syncing ? <Loader2 className="animate-spin" /> : <CloudUpload />}
							Sync to device
						</Button>
						<Button
							variant="outline"
							className="flex-1"
							onClick={handleSyncFromDevice}
							disabled={!isConnected || syncing}
						>
							{syncing ? <Loader2 className="animate-spin" /> : <CloudDownload />}
							Load from device
						</Button>
					</div>
					{bleEnabled && !isConnected && (
						<div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
							<Bluetooth className="size-4" />
							<span>Connect to Lesefluss to sync</span>
						</div>
					)}
				</div>
			</div>

			<AlertDialog open={showDisconnectAlert} onOpenChange={setShowDisconnectAlert}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Disconnect device</AlertDialogTitle>
						<AlertDialogDescription>
							Disconnect from {connectedDevice?.name || "the device"}?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleDisconnect}>Disconnect</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
