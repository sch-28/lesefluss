/**
 * Shared RSVP pickers: WPM presets and default-reader-mode cards.
 * Used by the RSVP settings page and the first-run onboarding flow.
 */

import { IonIcon } from "@ionic/react";
import { bookOutline, flashOutline } from "ionicons/icons";
import type React from "react";

export const WPM_PRESETS: Array<{ value: number; label: string }> = [
	{ value: 250, label: "Slow" },
	{ value: 350, label: "Normal" },
	{ value: 500, label: "Fast" },
];

export const READER_MODES: Array<{
	value: "scroll" | "rsvp";
	label: string;
	description: string;
	icon: string;
}> = [
	{
		value: "scroll",
		label: "Reader",
		description: "Scroll through pages",
		icon: bookOutline,
	},
	{
		value: "rsvp",
		label: "RSVP",
		description: "Flash one word at a time",
		icon: flashOutline,
	},
];

interface WpmPresetChipsProps {
	value: number;
	onChange: (wpm: number) => void;
}

export const WpmPresetChips: React.FC<WpmPresetChipsProps> = ({ value, onChange }) => (
	<div className="ap-chips">
		{WPM_PRESETS.map((p) => (
			<button
				key={p.value}
				type="button"
				className={value === p.value ? "ap-chip ap-chip--active" : "ap-chip"}
				onClick={() => onChange(p.value)}
			>
				{p.label} {p.value}
			</button>
		))}
	</div>
);

interface ReaderModeCardsProps {
	value: "scroll" | "rsvp";
	onChange: (mode: "scroll" | "rsvp") => void;
}

export const ReaderModeCards: React.FC<ReaderModeCardsProps> = ({ value, onChange }) => (
	<div className="rsvp-mode-picker">
		{READER_MODES.map((m) => {
			const isActive = value === m.value;
			return (
				<button
					key={m.value}
					type="button"
					className={isActive ? "rsvp-mode-card rsvp-mode-card--active" : "rsvp-mode-card"}
					onClick={() => onChange(m.value)}
					aria-pressed={isActive}
				>
					<IonIcon icon={m.icon} className="rsvp-mode-card__icon" />
					<span className="rsvp-mode-card__label">{m.label}</span>
					<span className="rsvp-mode-card__desc">{m.description}</span>
				</button>
			);
		})}
	</div>
);
