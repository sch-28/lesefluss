import type { DualScreenCommand, DualScreenSnapshot } from "../../services/dual-screen";
import type { Colors } from "../theme";
import { Button, Frame, IconCog, IconNext, IconPlay, IconPrev } from "../ui";

interface Props {
	colors: Colors;
	snap: DualScreenSnapshot | null;
	onCommand: (cmd: DualScreenCommand) => void;
	onOpenSettings: () => void;
}

export function ControlsView({ colors, snap, onCommand, onOpenSettings }: Props) {
	const title = snap?.context?.bookTitle ?? "";
	const chapter = snap?.context?.chapterTitle ?? "";
	const word = snap?.state?.word ?? "";
	const isPlaying = snap?.state?.isPlaying ?? false;
	const wpm = snap?.state?.wpm ?? 0;
	const totalBytes = snap?.context?.totalBytes ?? 0;
	const progressBytes = snap?.context?.progressBytes ?? 0;
	const pct = totalBytes ? (progressBytes / totalBytes) * 100 : 0;

	return (
		<Frame colors={colors}>
			<div style={{ position: "absolute", top: 16, right: 16 }}>
				<Button colors={colors} variant="ghost" onClick={onOpenSettings} aria-label="Settings">
					<IconCog />
				</Button>
			</div>

			<div style={{ textAlign: "center" }}>
				<div style={{ fontSize: 22, color: colors.heading }}>{title}</div>
				{chapter && (
					<div style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>{chapter}</div>
				)}
			</div>

			<div
				style={{
					fontSize: 56,
					fontFamily: "ui-monospace, monospace",
					color: colors.text,
					letterSpacing: 0.5,
					textAlign: "center",
					minHeight: 72,
				}}
			>
				{word}
			</div>

			<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
				<div style={{ display: "flex", gap: 18 }}>
					<Button colors={colors} onClick={() => onCommand({ kind: "backSentence" })} aria-label="Previous sentence">
						<IconPrev />
					</Button>
					<Button
						colors={colors}
						variant="solid"
						onClick={() => onCommand({ kind: "togglePlayPause" })}
						aria-label={isPlaying ? "Pause" : "Play"}
					>
						<IconPlay paused={!isPlaying} />
					</Button>
					<Button colors={colors} onClick={() => onCommand({ kind: "forwardSentence" })} aria-label="Next sentence">
						<IconNext />
					</Button>
				</div>

				<ProgressBar colors={colors} pct={pct} />

				<div style={{ fontSize: 13, color: colors.muted, letterSpacing: 0.6 }}>
					{Math.round(pct)}% · {wpm} wpm
				</div>
			</div>
		</Frame>
	);
}

function ProgressBar({ colors, pct }: { colors: Colors; pct: number }) {
	return (
		<div
			style={{
				width: "min(640px, 80vw)",
				height: 4,
				background: colors.progressBg,
				borderRadius: 2,
				overflow: "hidden",
			}}
		>
			<div
				style={{
					width: `${Math.max(0, Math.min(100, pct))}%`,
					height: "100%",
					background: colors.progressFill,
					transition: "width 240ms linear",
				}}
			/>
		</div>
	);
}
