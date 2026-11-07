import { calcOrpIndex, type RsvpSettings } from "@lesefluss/core";
import type React from "react";
import { focalLetterColorFor, useTheme } from "../contexts/theme-context";

interface Props {
	word: string;
	settings: Pick<RsvpSettings, "xOffset" | "focalLetterColor">;
	label: React.ReactNode;
	ariaLabel: string;
	onClick: () => void;
	className?: string;
	testId?: string;
}

/** One RSVP word on a tappable card, split at its focal letter like the reader shows it. */
export function RsvpWordStage({
	word,
	settings,
	label,
	ariaLabel,
	onClick,
	className,
	testId,
}: Props) {
	const { theme } = useTheme();
	const orpIndex = calcOrpIndex(word.length);
	const wordShiftCh = word.length / 2 - (orpIndex + 0.5);

	return (
		<button
			type="button"
			className={className ? `rsvp-preview-card ${className}` : "rsvp-preview-card"}
			style={
				{
					"--rsvp-focal-color": focalLetterColorFor(settings.focalLetterColor, theme),
				} as React.CSSProperties
			}
			onClick={onClick}
			aria-label={ariaLabel}
			data-testid={testId}
		>
			<span className="rsvp-preview-label">{label}</span>
			<span className="rsvp-preview-stage">
				<span className="rsvp-focal-line" style={{ left: `${settings.xOffset}%` }} />
				<span
					className="rsvp-preview-word"
					style={{ left: `${settings.xOffset}%`, transform: "translate(-50%, -50%)" }}
				>
					<span className="rsvp-word-line" style={{ transform: `translateX(${wordShiftCh}ch)` }}>
						<span className="rsvp-before">{word.slice(0, orpIndex)}</span>
						<span className="rsvp-focal">{word[orpIndex] ?? ""}</span>
						<span className="rsvp-after">{word.slice(orpIndex + 1)}</span>
					</span>
				</span>
			</span>
		</button>
	);
}
