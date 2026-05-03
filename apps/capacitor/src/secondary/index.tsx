import { useEffect, useState } from "react";
import type { DualScreenSnapshot } from "../services/dual-screen";
import { sendCommand, subscribeSnapshot } from "./bus";
import { ControlsView } from "./views/controls";
import { CoverView } from "./views/cover";
import { LibraryView } from "./views/library";
import { SettingsView } from "./views/settings";
import { palette } from "./theme";

type View = "auto" | "settings";

/** Resolve which view the secondary should show given the latest snapshot.
 * Pure function — easy to test and easy to override with the local "settings"
 * mode triggered by the cog button. */
function resolveAutoView(snap: DualScreenSnapshot | null): "controls" | "cover" | "library" | "idle" {
	if (snap?.state) return "controls";
	if (snap?.activeBook) return "cover";
	if (snap?.library && snap.library.length > 0) return "library";
	return "idle";
}

export function SecondaryApp() {
	const [snap, setSnap] = useState<DualScreenSnapshot | null>(null);
	const [view, setView] = useState<View>("auto");

	useEffect(() => subscribeSnapshot(setSnap), []);

	// When user opens settings then a new book starts playing, snap them back
	// to the auto view so they can see the controls.
	useEffect(() => {
		if (view === "settings" && snap?.state?.isPlaying) setView("auto");
	}, [view, snap?.state?.isPlaying]);

	const themeName = snap?.appShell?.theme ?? "dark";
	const colors = palette(themeName);

	let body: React.ReactNode;
	if (view === "settings") {
		body = (
			<SettingsView
				colors={colors}
				settings={snap?.settings ?? null}
				onChange={(key, value) => sendCommand({ kind: "updateSetting", key, value })}
				onBack={() => setView("auto")}
			/>
		);
	} else {
		switch (resolveAutoView(snap)) {
			case "controls":
				body = (
					<ControlsView
						colors={colors}
						snap={snap}
						onCommand={sendCommand}
						onOpenSettings={() => setView("settings")}
					/>
				);
				break;
			case "cover":
				body = (
					<CoverView
						colors={colors}
						book={snap?.activeBook ?? null}
						onOpenSettings={() => setView("settings")}
					/>
				);
				break;
			case "library":
				body = (
					<LibraryView
						colors={colors}
						books={snap?.library ?? []}
						onOpen={(bookId) => sendCommand({ kind: "openBook", bookId })}
						onOpenSettings={() => setView("settings")}
					/>
				);
				break;
			default:
				body = (
					<div
						style={{
							width: "100vw",
							height: "100vh",
							background: colors.bg,
							color: colors.muted,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: 36,
							fontFamily: "system-ui, sans-serif",
							letterSpacing: 1,
						}}
					>
						Lesefluss
					</div>
				);
		}
	}

	return body as React.JSX.Element;
}
