import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import { Popover, PopoverAnchor, PopoverContent } from "@lesefluss/ui/popover";
import { ChevronRight } from "lucide-react";
import type React from "react";
import { ToggleRow } from "../../components/app-shell/toggle-row";
import { FontCards, ThemeCards } from "../../components/appearance-pickers";
import { ModeCards, PAGINATION_STYLE_OPTIONS } from "../../components/rsvp-pickers";
import { SettingsRow } from "../../components/settings/settings-row";
import { SettingsSection } from "../../components/settings/settings-section";
import { StepperRow } from "../../components/settings/stepper-row";
import { TextSpacingRows } from "../../components/settings/text-spacing-rows";
import { useTheme } from "../../contexts/theme-context";
import { useAppearanceSettings } from "../../hooks/use-appearance-settings";

const { READER_FONT_SIZE, READER_LINE_SPACING, READER_MARGIN, READER_RULER_LINES } =
	SETTING_CONSTRAINTS;

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** What the popover points at: it opens from the More menu, which has no trigger of its own. */
	anchor: React.ReactNode;
	onOpenAllSettings: () => void;
}

/** The reader's subset of Settings › Reader (and the theme), built from the same rows and labels. */
const AppearancePopover: React.FC<Props> = ({ open, onOpenChange, anchor, onOpenAllSettings }) => {
	const { storedTheme, setTheme } = useTheme();
	const {
		fontSize,
		fontFamily,
		isBold,
		textAlign,
		readingRuler,
		lineSpacing,
		margin,
		paginationStyle,
		isMotionReduced,
		isEinkMode,
		adjustFontSize,
		adjustLineSpacing,
		adjustMargin,
		setFontFamily,
		setBold,
		setTextAlign,
		setReadingRuler,
		setReadingRulerLines,
		setPaginationStyle,
	} = useAppearanceSettings();

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverAnchor asChild>{anchor}</PopoverAnchor>
			<PopoverContent
				// Remounted when e-ink or OS reduce motion flips: a close racing the
				// switch leaves Radix waiting for an exit animation that is then
				// stripped, so the popover would stay on screen for good.
				key={`${isEinkMode}|${isMotionReduced}`}
				aria-label="Appearance"
				align="end"
				collisionPadding={8}
				// The rows outgrow a small phone, landscape or a large app font.
				className="max-h-[calc(var(--radix-popover-content-available-height)-var(--safe-bottom))] w-80 max-w-(--radix-popover-content-available-width) overflow-y-auto overscroll-contain p-0"
			>
				<div className="appearance-popover-content pb-1">
					<SettingsSection title="Theme" hint={isEinkMode ? "(set by E-ink display)" : undefined}>
						<SettingsRow stacked>
							<ThemeCards value={storedTheme} onChange={setTheme} disabled={isEinkMode} compact />
						</SettingsRow>
					</SettingsSection>
					<SettingsSection title="Layout" hint={isEinkMode ? "(set by E-ink display)" : undefined}>
						<SettingsRow stacked>
							<ModeCards
								options={PAGINATION_STYLE_OPTIONS}
								value={paginationStyle}
								onChange={setPaginationStyle}
								disabled={isEinkMode}
								compact
							/>
						</SettingsRow>
					</SettingsSection>
					<SettingsSection title="Text">
						<SettingsRow stacked>
							<FontCards value={fontFamily} onChange={setFontFamily} compact />
						</SettingsRow>
						<StepperRow
							label="Text size"
							value={fontSize}
							display={`${fontSize}px`}
							min={READER_FONT_SIZE.min}
							max={READER_FONT_SIZE.max}
							step={READER_FONT_SIZE.step}
							onChange={(v) => adjustFontSize(v - fontSize)}
						/>
						<StepperRow
							label="Line spacing"
							value={lineSpacing}
							display={lineSpacing.toFixed(1)}
							min={READER_LINE_SPACING.min}
							max={READER_LINE_SPACING.max}
							step={READER_LINE_SPACING.step}
							onChange={(v) => adjustLineSpacing(v - lineSpacing)}
						/>
						<TextSpacingRows />
						<StepperRow
							label="Margins"
							value={margin}
							display={`${margin}px`}
							min={READER_MARGIN.min}
							max={READER_MARGIN.max}
							step={READER_MARGIN.step}
							onChange={(v) => adjustMargin(v - margin)}
						/>
						<ToggleRow
							id="ap-reader-bold"
							title="Bold text"
							checked={isBold}
							onCheckedChange={setBold}
						/>
						<ToggleRow
							id="ap-reader-justify"
							title="Justify text"
							checked={textAlign === "justify"}
							onCheckedChange={(on) => setTextAlign(on ? "justify" : "left")}
						/>
						<ToggleRow
							id="ap-reading-ruler"
							title="Reading ruler"
							checked={readingRuler.isOn}
							onCheckedChange={setReadingRuler}
						/>
						{readingRuler.isOn && (
							<StepperRow
								label="Ruler lines"
								value={readingRuler.lines}
								display={String(readingRuler.lines)}
								min={READER_RULER_LINES.min}
								max={READER_RULER_LINES.max}
								step={READER_RULER_LINES.step}
								onChange={setReadingRulerLines}
							/>
						)}
					</SettingsSection>
					<button
						type="button"
						onClick={onOpenAllSettings}
						className="flex min-h-11 w-full items-center justify-between gap-2 border-border border-t px-4 text-left text-primary text-sm hover:bg-muted/60"
					>
						All settings
						<ChevronRight className="size-4" />
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
};

export default AppearancePopover;
