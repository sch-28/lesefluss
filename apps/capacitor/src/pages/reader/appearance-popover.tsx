import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import { IconButton } from "@lesefluss/ui/icon-button";
import { Popover, PopoverAnchor, PopoverContent } from "@lesefluss/ui/popover";
import { SegmentedControl } from "@lesefluss/ui/segmented-control";
import { Stepper } from "@lesefluss/ui/stepper";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { ThemeCards } from "../../components/appearance-pickers";
import { PAGINATION_STYLE_OPTIONS } from "../../components/rsvp-pickers";
import { useTheme } from "../../contexts/theme-context";
import {
	FONT_FAMILIES,
	type SpacingPreset,
	spacingPresetOf,
	useAppearanceSettings,
} from "../../hooks/use-appearance-settings";

const { READER_FONT_SIZE } = SETTING_CONSTRAINTS;

const SPACING_OPTIONS = [
	{ value: "compact", label: "Compact" },
	{ value: "normal", label: "Normal" },
	{ value: "airy", label: "Airy" },
] as const satisfies readonly { value: SpacingPreset; label: string }[];

const LAYOUT_OPTIONS = PAGINATION_STYLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The header's Aa button, which the popover points at. */
	anchor: React.ReactNode;
	onOpenAllSettings: () => void;
}

const GROUP_LABEL = "text-muted-foreground text-xs";

/**
 * Five rows, the ui_rules cap for a popover: theme, font with size, spacing
 * preset, scroll or page, and More settings. Everything finer lives in
 * Settings › Reader.
 */
const AppearancePopover: React.FC<Props> = ({ open, onOpenChange, anchor, onOpenAllSettings }) => {
	const [isPickingFont, setPickingFont] = useState(false);
	const handleOpenChange = (next: boolean) => {
		if (!next) setPickingFont(false);
		onOpenChange(next);
	};
	const { storedTheme, setTheme } = useTheme();
	const {
		fontSize,
		fontFamily,
		lineSpacing,
		letterSpacing,
		wordSpacing,
		paragraphSpacing,
		paginationStyle,
		isMotionReduced,
		isEinkMode,
		adjustFontSize,
		applySpacingPreset,
		setFontFamily,
		setPaginationStyle,
	} = useAppearanceSettings();
	const font = FONT_FAMILIES.find((f) => f.value === fontFamily) ?? FONT_FAMILIES[0];
	const spacingPreset = spacingPresetOf({
		line: lineSpacing,
		letter: letterSpacing,
		word: wordSpacing,
		paragraph: paragraphSpacing,
	});

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverAnchor asChild>{anchor}</PopoverAnchor>
			<PopoverContent
				// Remounted when e-ink or OS reduce motion flips: a close racing the
				// switch leaves Radix waiting for an exit animation that is then
				// stripped, so the popover would stay on screen for good.
				key={`${isEinkMode}|${isMotionReduced}`}
				aria-label="Appearance"
				align="end"
				collisionPadding={8}
				// A small phone, landscape or a large app font can still outgrow it.
				className="appearance-popover-content max-h-[calc(var(--radix-popover-content-available-height)-var(--safe-bottom))] w-80 max-w-(--radix-popover-content-available-width) overflow-y-auto overscroll-contain p-0"
			>
				{isPickingFont ? (
					<div className="flex flex-col gap-1 p-2" data-testid="appearance-fonts">
						<div className="flex items-center gap-1">
							<IconButton aria-label="Back to appearance" onClick={() => setPickingFont(false)}>
								<ChevronLeft />
							</IconButton>
							<span className="font-semibold text-sm">Font</span>
						</div>
						{FONT_FAMILIES.map((f) => (
							<button
								key={f.value}
								type="button"
								aria-pressed={f.value === fontFamily}
								aria-label={f.name}
								onClick={() => {
									setFontFamily(f.value);
									setPickingFont(false);
								}}
								className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-left text-base hover:bg-muted"
							>
								<span style={{ fontFamily: f.stack }}>{f.label}</span>
								{f.value === fontFamily && <Check className="size-4 text-primary" />}
							</button>
						))}
					</div>
				) : (
					<div className="flex flex-col gap-4 px-4 pt-3" data-testid="appearance-rows">
						<div className="flex flex-col gap-2" data-appearance-row="theme">
							<span className={GROUP_LABEL}>
								Theme · {isEinkMode ? "set by E-ink display" : "applies to the whole app"}
							</span>
							<ThemeCards value={storedTheme} onChange={setTheme} disabled={isEinkMode} compact />
						</div>
						<div className="flex flex-col gap-2" data-appearance-row="text">
							<span className={GROUP_LABEL}>Font and text size</span>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => setPickingFont(true)}
									aria-label={`Font: ${font.name}`}
									className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-1 rounded-[10px] border border-border pr-1 pl-3 text-left hover:bg-muted"
								>
									<span className="truncate text-base" style={{ fontFamily: font.stack }}>
										{font.label}
									</span>
									<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
								</button>
								<Stepper
									label="Text size"
									value={fontSize}
									valueClassName="min-w-10"
									canDecrement={fontSize > READER_FONT_SIZE.min}
									canIncrement={fontSize < READER_FONT_SIZE.max}
									onDecrement={() => adjustFontSize(-READER_FONT_SIZE.step)}
									onIncrement={() => adjustFontSize(READER_FONT_SIZE.step)}
								/>
							</div>
						</div>
						<div className="flex flex-col gap-2" data-appearance-row="spacing">
							<span className={GROUP_LABEL}>
								Spacing{spacingPreset ? "" : " · custom, set in Settings"}
							</span>
							<SegmentedControl<SpacingPreset>
								aria-label="Spacing"
								// No preset matches fine-tuned values, so none shows selected.
								value={spacingPreset ?? ("" as SpacingPreset)}
								onValueChange={applySpacingPreset}
								options={SPACING_OPTIONS}
							/>
						</div>
						<div className="flex flex-col gap-2" data-appearance-row="layout">
							<span className={GROUP_LABEL}>
								Layout{isEinkMode ? " · set by E-ink display" : ""}
							</span>
							<SegmentedControl
								aria-label="Layout"
								value={paginationStyle}
								onValueChange={setPaginationStyle}
								options={LAYOUT_OPTIONS}
								disabled={isEinkMode}
							/>
						</div>
						<button
							type="button"
							onClick={onOpenAllSettings}
							data-appearance-row="more"
							className="-mx-4 flex min-h-12 items-center justify-between gap-2 border-border border-t px-4 text-left font-medium text-primary text-sm hover:bg-muted/60"
						>
							More settings
							<ChevronRight className="size-4" />
						</button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
};

export default AppearancePopover;
