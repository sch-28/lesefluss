/**
 * Shared RSVP pickers: WPM presets and mode-card lists (default-reader-mode,
 * pagination-style). Used by the RSVP settings page and the first-run
 * onboarding flow.
 */

import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import type { PaginationStyle } from "@lesefluss/core";
import { ArrowUpDown, BookOpen, type LucideIcon, Zap } from "lucide-react";
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
	icon: LucideIcon;
}

export const READER_MODE_OPTIONS: ReadonlyArray<ModeOption<"scroll" | "rsvp">> = [
	{
		value: "scroll",
		label: "Reader",
		description: "Scroll through pages",
		icon: BookOpen,
	},
	{
		value: "rsvp",
		label: "RSVP",
		description: "Flash one word at a time",
		icon: Zap,
	},
];

export const PAGINATION_STYLE_OPTIONS: ReadonlyArray<ModeOption<PaginationStyle>> = [
	{
		value: "scroll",
		label: "Scroll",
		description: "One long flowing page",
		icon: ArrowUpDown,
	},
	{
		value: "page",
		label: "Pages",
		description: "Tap or swipe to turn",
		icon: BookOpen,
	},
];

interface WpmPresetChipsProps {
	value: number;
	onChange: (wpm: number) => void;
}

export const WpmPresetChips: React.FC<WpmPresetChipsProps> = ({ value, onChange }) => (
	<div className="flex flex-wrap gap-2">
		{WPM_PRESETS.map((p) => {
			const isActive = value === p.value;
			return (
				<Button
					key={p.value}
					variant={isActive ? "default" : "outline"}
					className="flex-1"
					onClick={() => onChange(p.value)}
				>
					{p.label} {p.value}
				</Button>
			);
		})}
	</div>
);

interface ModeCardsProps<T extends string> {
	options: ReadonlyArray<ModeOption<T>>;
	value: T;
	onChange: (v: T) => void;
}

export function ModeCards<T extends string>({ options, value, onChange }: ModeCardsProps<T>) {
	return (
		<div className="grid grid-cols-2 gap-3">
			{options.map((m) => {
				const isActive = value === m.value;
				const Icon = m.icon;
				return (
					<button
						key={m.value}
						type="button"
						onClick={() => onChange(m.value)}
						aria-pressed={isActive}
						className={cn(
							"flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors",
							isActive
								? "border-primary bg-primary/5"
								: "border-border bg-card hover:border-muted-foreground/30",
						)}
					>
						<Icon
							className={cn(
								"size-6",
								isActive ? "text-primary" : "text-muted-foreground",
							)}
						/>
						<span className="font-semibold text-foreground text-sm">{m.label}</span>
						<span className="text-muted-foreground text-xs leading-tight">{m.description}</span>
					</button>
				);
			})}
		</div>
	);
}
