import { Bug, ChevronDown, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/components/toast";
import { type DeviceDiagnostics, getDeviceDiagnostics } from "@/services/telemetry";
import { copyToClipboard } from "@/utils/clipboard";
import { probeSafeArea, type SafeAreaProbe } from "@/utils/safe-area";

function viewportLine(): string | null {
	if (typeof window === "undefined") return null;
	return `viewport ${window.innerWidth}x${window.innerHeight} · screen ${window.screen.width}x${window.screen.height} · dpr ${window.devicePixelRatio}`;
}

function buildReport(device: DeviceDiagnostics | null, safeArea: SafeAreaProbe | null): string {
	const lines = [
		`Lesefluss ${device?.version ?? "unknown"}`,
		`platform ${device?.platform ?? "unknown"} · ${device?.os ?? "unknown OS"} · WebView ${device?.webview ?? "unknown"}`,
	];
	if (safeArea) {
		lines.push(
			`env    top ${safeArea.envTop} · bottom ${safeArea.envBottom}`,
			`var    top ${safeArea.varTop} · bottom ${safeArea.varBottom}`,
		);
	}
	const viewport = viewportLine();
	if (viewport) lines.push(viewport);
	return lines.join("\n");
}

export function DiagnosticsRow() {
	const [expanded, setExpanded] = useState(false);
	const [device, setDevice] = useState<DeviceDiagnostics | null>(null);
	const [safeArea, setSafeArea] = useState<SafeAreaProbe | null>(null);

	useEffect(() => {
		getDeviceDiagnostics()
			.then(setDevice)
			.catch(() => {});
	}, []);

	// Probed on open, not on mount: Capacitor injects the variables asynchronously
	// and re-injects them on every inset change (rotation, keyboard).
	const toggle = () => {
		if (!expanded) setSafeArea(probeSafeArea());
		setExpanded(!expanded);
	};

	const report = buildReport(device, safeArea);
	const subtitle = device
		? `v${device.version}${device.webview ? ` · WebView ${device.webview}` : ""}`
		: "Loading...";

	const copy = async () => {
		const ok = await copyToClipboard(report);
		if (ok) toast.success("Diagnostics copied");
		else toast.error("Could not copy diagnostics");
	};

	return (
		<div className="bg-card">
			<button
				type="button"
				onClick={toggle}
				className="flex w-full cursor-pointer items-center gap-3 bg-card px-4 py-3 text-left no-underline transition-colors hover:bg-muted/60"
			>
				<Bug className="size-5 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					<div className="font-medium text-foreground text-sm">Diagnostics</div>
					<div className="text-muted-foreground text-xs">{subtitle}</div>
				</div>
				<ChevronDown
					className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
				/>
			</button>

			{expanded && (
				<div className="border-border border-t px-4 py-3">
					<pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground leading-relaxed">
						{report}
					</pre>
					<button
						type="button"
						onClick={copy}
						className="mt-3 flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-muted/60"
					>
						<Copy className="size-3.5" />
						Copy
					</button>
				</div>
			)}
		</div>
	);
}
