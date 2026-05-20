/**
 * SessionDebugBadge — floating overlay that mirrors the reading-session
 * tracker's live state. Lets a tester see at a glance whether a sitting is
 * recording, accumulating words, paused due to idle/background, etc., without
 * tethering the phone for adb logcat.
 *
 * Visibility: gated on `localStorage["lesefluss.debug.reading"] === "1"`.
 * Toggle from the device console (Eruda / Chrome DevTools remote inspect) or
 * leave on during a debug build by default.
 */
import type React from "react";
import { useEffect, useState } from "react";
import type { DebugSnapshot } from "./session-tracker";

type Props = {
	getSnapshot: () => DebugSnapshot | null;
};

const POLL_MS = 500;

function isEnabled(): boolean {
	try {
		const v = localStorage.getItem("lesefluss.debug.reading");
		// Default on while diagnosing session-tracking regressions. Disable
		// from the console with: localStorage.setItem("lesefluss.debug.reading", "0")
		if (v === null) return true;
		return v === "1";
	} catch {
		return false;
	}
}

function fmtDuration(ms: number): string {
	const total = Math.floor(ms / 1000);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SessionDebugBadge({ getSnapshot }: Props): React.ReactElement | null {
	const [enabled, setEnabled] = useState(isEnabled);
	const [snap, setSnap] = useState<DebugSnapshot | null>(null);

	useEffect(() => {
		if (!enabled) return;
		const sync = () => setSnap(getSnapshot());
		sync();
		const interval = setInterval(sync, POLL_MS);
		return () => clearInterval(interval);
	}, [enabled, getSnapshot]);

	// Allow runtime toggle without reload: a localStorage write + manual
	// re-render hook. Cheap to re-check; the badge is debug-only.
	useEffect(() => {
		const id = setInterval(() => {
			const next = isEnabled();
			setEnabled((prev) => (prev === next ? prev : next));
		}, 2000);
		return () => clearInterval(id);
	}, []);

	if (!enabled) return null;

	const sessionLabel = !snap
		? "no-hook"
		: !snap.hasSession
			? "idle"
			: snap.paused
				? "paused"
				: "active";

	const sessionColor = !snap
		? "#888"
		: !snap.hasSession
			? "#888"
			: snap.paused
				? "#f59e0b"
				: "#10b981";

	const fgLabel = !snap?.foreground ? "BG" : snap.reading ? "FG-read" : "FG-idle";
	const idleSec = snap ? Math.floor(snap.msSinceLastActivity / 1000) : 0;
	const dur = snap?.hasSession ? fmtDuration(snap.durationMs) : "—";
	const words = snap?.hasSession ? snap.wordsAccumulated : 0;

	return (
		<div
			style={{
				position: "fixed",
				bottom: 8,
				left: 8,
				zIndex: 9999,
				pointerEvents: "none",
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				fontSize: 10,
				lineHeight: 1.2,
				color: "#fff",
				background: "rgba(0,0,0,0.7)",
				padding: "4px 6px",
				borderRadius: 4,
				maxWidth: 200,
			}}
		>
			<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
				<span
					style={{
						display: "inline-block",
						width: 8,
						height: 8,
						borderRadius: "50%",
						background: sessionColor,
					}}
				/>
				<span>session: {sessionLabel}</span>
			</div>
			<div>dur: {dur}</div>
			<div>words: {words}</div>
			<div>state: {fgLabel}</div>
			<div>idle: {idleSec}s</div>
		</div>
	);
}
