// Fixed ESP32 flash total - used to estimate free space after transfer.
export const DEVICE_TOTAL_BYTES = 1_700_000;

// Fallback speed used for pre-transfer time estimate (bytes/sec).
export const ESTIMATED_BPS = 5_000;

export function formatBytes(bytes: number): string {
	if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
	if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
	return `${bytes} B`;
}

export function formatSeconds(sec: number): string {
	if (sec < 60) return `${Math.round(sec)}s`;
	const m = Math.floor(sec / 60);
	const s = Math.round(sec % 60);
	return `${m}m ${s}s`;
}
