import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { SYNC_URL } from "../sync/auth-client";

/**
 * Anonymous diagnostics beacon. Fire-and-forget, never throws, never blocks.
 *
 * Exists to surface silent client failures (e.g. a position write that never
 * persists) that no-account users hit and that otherwise reach us through no
 * channel at all. Sends no PII: an ephemeral per-launch session id, app version,
 * platform, a coarse OS version, and an error message. Reported as Diagnostics
 * under the Play Data Safety declaration.
 */

// Opt-out preference. Stored locally (not synced, it is a per-device choice) and
// mirrored in memory so reportEvent can check it synchronously. Defaults on.
const TELEMETRY_PREF_KEY = "lesefluss:telemetry-enabled";
let enabled = ((): boolean => {
	try {
		return localStorage.getItem(TELEMETRY_PREF_KEY) !== "false";
	} catch {
		return true;
	}
})();

export function isTelemetryEnabled(): boolean {
	return enabled;
}

export function setTelemetryEnabled(value: boolean): void {
	enabled = value;
	try {
		localStorage.setItem(TELEMETRY_PREF_KEY, value ? "true" : "false");
	} catch {
		// Preference is best-effort; the in-memory value still holds for this launch.
	}
}

// Ephemeral: regenerated every launch, in-memory only. Groups events from one
// app run without being a persistent device identifier.
const sessionId = ((): string => {
	try {
		return crypto.randomUUID();
	} catch {
		return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
	}
})();

let appVersionPromise: Promise<string> | null = null;
function getAppVersion(): Promise<string> {
	if (!appVersionPromise) {
		appVersionPromise = App.getInfo()
			.then((info) => info.version)
			.catch(() => "unknown");
	}
	return appVersionPromise;
}

function coarseOsVersion(): string | undefined {
	const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
	const android = ua.match(/Android \d+(?:\.\d+)?/);
	if (android) return android[0];
	const ios = ua.match(/OS \d+(?:_\d+)?/);
	if (ios) return `iOS ${ios[0].slice(3).replace("_", ".")}`;
	return undefined;
}

function webViewVersion(): string | undefined {
	const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
	return ua.match(/Chrome\/(\d+(?:\.\d+)*)/)?.[1];
}

export type DeviceDiagnostics = {
	version: string;
	platform: string;
	os?: string;
	webview?: string;
};

export async function getDeviceDiagnostics(): Promise<DeviceDiagnostics> {
	return {
		version: await getAppVersion(),
		platform: Capacitor.getPlatform(),
		os: coarseOsVersion(),
		webview: webViewVersion(),
	};
}

// Per-type throttle + per-launch cap so a device stuck in a failure loop can't
// flood the endpoint.
const MIN_INTERVAL_MS = 30_000;
const MAX_EVENTS_PER_LAUNCH = 50;
const lastSentByType = new Map<string, number>();
let sentCount = 0;

function shouldSend(type: string): boolean {
	if (sentCount >= MAX_EVENTS_PER_LAUNCH) return false;
	const now = Date.now();
	const last = lastSentByType.get(type) ?? 0;
	if (now - last < MIN_INTERVAL_MS) return false;
	lastSentByType.set(type, now);
	sentCount++;
	return true;
}

export type TelemetryOptions = { message?: string; extra?: Record<string, unknown> };

export function reportEvent(type: string, opts: TelemetryOptions = {}): void {
	if (!enabled) return;
	if (!SYNC_URL) return;
	if (!shouldSend(type)) return;
	void send(type, opts).catch(() => {
		// Diagnostics are best-effort and must never affect the app.
	});
}

async function send(type: string, opts: TelemetryOptions): Promise<void> {
	const body = JSON.stringify({
		type,
		sessionId,
		version: await getAppVersion(),
		platform: Capacitor.getPlatform(),
		os: coarseOsVersion(),
		message: opts.message,
		extra: opts.extra,
		at: Date.now(),
	});
	await fetch(`${SYNC_URL}/api/telemetry`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
		keepalive: true,
	});
}

export function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === "string") return err;
	try {
		return JSON.stringify(err);
	} catch {
		return String(err);
	}
}
