/**
 * Shared RSVP pickers: WPM presets and mode-card lists (default-reader-mode,
 * pagination-style). Used by the RSVP settings page and the first-run
 * onboarding flow.
 */

import { IonIcon } from "@ionic/react";
import type { PaginationStyle } from "@lesefluss/rsvp-core";
import { bookOutline, flashOutline, swapVerticalOutline } from "ionicons/icons";
import type React from "react";

export const WPM_PRESETS: Array<{ value: number; label: string }> = [
	{ value: 250, label: "Slow" },
	{ value: 350, label: "Normal" },
	{ value: 500, label: "Fast" },
];

export interface ModeOption<T extends string> {
	value: T;
	label: string;
	description: string;
	icon: string;
}

export const READER_MODE_OPTIONS: ReadonlyArray<ModeOption<"scroll" | "rsvp">> = [
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

export const PAGINATION_STYLE_OPTIONS: ReadonlyArray<ModeOption<PaginationStyle>> = [
	{
		value: "scroll",
		label: "Scroll",
		description: "One long flowing page",
		icon: swapVerticalOutline,
	},
	{
		value: "page",
		label: "Pages",
		description: "Tap or swipe to turn",
		icon: bookOutline,
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

interface ModeCardsProps<T extends string> {
	options: ReadonlyArray<ModeOption<T>>;
	value: T;
	onChange: (v: T) => void;
}

export function ModeCards<T extends string>({ options, value, onChange }: ModeCardsProps<T>) {
	return (
		<div className="rsvp-mode-picker">
			{options.map((m) => {
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
}
