import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import { Popover, PopoverAnchor, PopoverContent } from "@lesefluss/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@lesefluss/ui/toggle-group";
import type React from "react";
import { PAGINATION_STYLE_OPTIONS } from "../../components/rsvp-pickers";
import { isAppTheme, useTheme } from "../../contexts/theme-context";
import {
	DEFAULT_TEXT_SPACING,
	FONT_FAMILIES,
	percentOfFont,
	spacingLabel,
	THEMES,
	textAlignFor,
	useAppearanceSettings,
} from "../../hooks/use-appearance-settings";
import { IS_VOLUME_KEYS_SUPPORTED } from "../../services/volume-keys";

const StepRow: React.FC<{
	label: string;
	display: string;
	value: number;
	constraint: { min: number; max: number; step: number };
	onStep: (delta: number) => void;
	glyphs?: [string, string];
}> = ({ label, display, value, constraint, onStep, glyphs = ["−", "+"] }) => {
	const atMin = value <= constraint.min;
	const atMax = value >= constraint.max;
	// aria-disabled, not disabled: a disabled button drops the focus it holds,
	// and stepping to the end of the range would then lose the keyboard user.
	return (
		<div className="ap-row">
			<span className="ap-row-label">{label}</span>
			<span className="ap-row-value" aria-live="polite">
				{display}
			</span>
			<div className="ap-row-buttons">
				<button
					type="button"
					className="ap-step-btn"
					aria-label={`Decrease ${label}`}
					aria-disabled={atMin}
					onClick={() => {
						if (!atMin) onStep(-constraint.step);
					}}
				>
					{glyphs[0]}
				</button>
				<button
					type="button"
					className="ap-step-btn"
					aria-label={`Increase ${label}`}
					aria-disabled={atMax}
					onClick={() => {
						if (!atMax) onStep(constraint.step);
					}}
				>
					{glyphs[1]}
				</button>
			</div>
		</div>
	);
};

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** What the popover points at: it opens from the More menu, which has no trigger of its own. */
	anchor: React.ReactNode;
}

const AppearancePopover: React.FC<Props> = ({ open, onOpenChange, anchor }) => {
	const { storedTheme, setTheme } = useTheme();
	const {
		fontSize,
		fontFamily,
		isBold,
		textAlign,
		lineSpacing,
		margin,
		letterSpacing,
		wordSpacing,
		paragraphSpacing,
		paginationStyle,
		showReadingTime,
		showActiveWordUnderline,
		showGlossaryUnderline,
		pageTurnAnimation,
		isEinkMode,
		volumeKeys,
		adjustFontSize,
		adjustLineSpacing,
		adjustMargin,
		adjustLetterSpacing,
		adjustWordSpacing,
		adjustParagraphSpacing,
		resetTextSpacing,
		setFontFamily,
		setBold,
		setTextAlign,
		setPaginationStyle,
		setShowReadingTime,
		setShowActiveWordUnderline,
		setShowGlossaryUnderline,
		setPageTurnAnimation,
		setEinkMode,
		setVolumeKeyPageTurn,
		setVolumeKeyInvert,
	} = useAppearanceSettings();

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverAnchor asChild>{anchor}</PopoverAnchor>
			<PopoverContent
				// Remounted when e-ink flips: a close racing the switch leaves Radix
				// waiting for an exit animation that e-ink then strips, so the
				// popover would stay on screen for good.
				key={String(isEinkMode)}
				align="end"
				collisionPadding={8}
				// The rows outgrow a small phone, landscape or a large app font.
				className="max-h-(--radix-popover-content-available-height) w-80 overflow-y-auto overscroll-contain p-0"
			>
				<div className="appearance-popover-content">
					<div className="ap-section">
						<span className="ap-label" id="ap-theme">
							{isEinkMode ? "Theme (set by E-ink display)" : "Theme"}
						</span>
						<ToggleGroup
							aria-labelledby="ap-theme"
							type="single"
							variant="outline"
							value={storedTheme}
							disabled={isEinkMode}
							// Re-tapping the pressed item yields "": rewrite the shown value so an
							// unknown synced one can still be replaced; the setter skips no-ops.
							onValueChange={(v) => setTheme(isAppTheme(v) ? v : storedTheme)}
							className="w-full"
						>
							{THEMES.map((t) => (
								<ToggleGroupItem key={t.value} value={t.value}>
									{t.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					<div className="ap-section">
						<span className="ap-label" id="ap-pagination">
							{isEinkMode ? "Pagination (set by E-ink display)" : "Pagination"}
						</span>
						<ToggleGroup
							aria-labelledby="ap-pagination"
							type="single"
							variant="outline"
							value={paginationStyle}
							disabled={isEinkMode}
							onValueChange={(v) => v && setPaginationStyle(v as typeof paginationStyle)}
							className="w-full"
						>
							{PAGINATION_STYLE_OPTIONS.map((p) => (
								<ToggleGroupItem key={p.value} value={p.value}>
									{p.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					<div className="ap-section">
						<span className="ap-label" id="ap-font">
							Font
						</span>
						<ToggleGroup
							aria-labelledby="ap-font"
							type="single"
							variant="outline"
							value={fontFamily}
							onValueChange={(v) => setFontFamily(v || fontFamily)}
							className="grid w-full grid-cols-2 gap-1"
						>
							{FONT_FAMILIES.map((f) => (
								<ToggleGroupItem
									key={f.value}
									value={f.value}
									className="rounded-md text-xs data-[variant=outline]:border-l [&:last-child:nth-child(odd)]:col-span-2"
									style={{ fontFamily: f.stack }}
									aria-label={f.name}
								>
									{f.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					<div className="ap-section ap-section--rows">
						<StepRow
							label="Size"
							display={`${fontSize}px`}
							value={fontSize}
							constraint={SETTING_CONSTRAINTS.READER_FONT_SIZE}
							onStep={adjustFontSize}
							glyphs={["A−", "A+"]}
						/>
						<div className="ap-row">
							<span className="ap-row-label" id="ap-bold-text">
								Bold text
							</span>
							<ToggleGroup
								aria-labelledby="ap-bold-text"
								type="single"
								variant="outline"
								value={isBold ? "on" : "off"}
								onValueChange={(v) => v && setBold(v === "on")}
							>
								<ToggleGroupItem value="off">Off</ToggleGroupItem>
								<ToggleGroupItem value="on">On</ToggleGroupItem>
							</ToggleGroup>
						</div>
						<div className="ap-row">
							<span className="ap-row-label" id="ap-text-align">
								Alignment
							</span>
							<ToggleGroup
								aria-labelledby="ap-text-align"
								type="single"
								variant="outline"
								value={textAlign}
								onValueChange={(v) => v && setTextAlign(textAlignFor(v))}
							>
								<ToggleGroupItem value="left">Left</ToggleGroupItem>
								<ToggleGroupItem value="justify">Justify</ToggleGroupItem>
							</ToggleGroup>
						</div>
						<StepRow
							label="Line spacing"
							display={lineSpacing.toFixed(1)}
							value={lineSpacing}
							constraint={SETTING_CONSTRAINTS.READER_LINE_SPACING}
							onStep={adjustLineSpacing}
						/>
						<StepRow
							label="Letter spacing"
							display={spacingLabel(letterSpacing, DEFAULT_TEXT_SPACING.letter, percentOfFont)}
							value={letterSpacing}
							constraint={SETTING_CONSTRAINTS.READER_LETTER_SPACING}
							onStep={adjustLetterSpacing}
						/>
						<StepRow
							label="Word spacing"
							display={spacingLabel(wordSpacing, DEFAULT_TEXT_SPACING.word, percentOfFont)}
							value={wordSpacing}
							constraint={SETTING_CONSTRAINTS.READER_WORD_SPACING}
							onStep={adjustWordSpacing}
						/>
						<StepRow
							label="Paragraph spacing"
							display={spacingLabel(paragraphSpacing, DEFAULT_TEXT_SPACING.paragraph, (v) =>
								v.toFixed(1),
							)}
							value={paragraphSpacing}
							constraint={SETTING_CONSTRAINTS.READER_PARAGRAPH_SPACING}
							onStep={adjustParagraphSpacing}
						/>
						<button type="button" className="ap-reset-btn" onClick={resetTextSpacing}>
							Reset spacing
						</button>
						<StepRow
							label="Margins"
							display={`${margin}px`}
							value={margin}
							constraint={SETTING_CONSTRAINTS.READER_MARGIN}
							onStep={adjustMargin}
						/>

						{paginationStyle === "page" && !isEinkMode && (
							<div className="ap-row">
								<span className="ap-row-label" id="ap-page-animation">
									Page animation
								</span>
								<ToggleGroup
									aria-labelledby="ap-page-animation"
									type="single"
									variant="outline"
									value={pageTurnAnimation ? "on" : "off"}
									onValueChange={(v) => v && setPageTurnAnimation(v === "on")}
								>
									<ToggleGroupItem value="off">Off</ToggleGroupItem>
									<ToggleGroupItem value="on">On</ToggleGroupItem>
								</ToggleGroup>
							</div>
						)}
						<div className="ap-row">
							<span className="ap-row-label" id="ap-e-ink-display">
								E-ink display
							</span>
							<ToggleGroup
								aria-labelledby="ap-e-ink-display"
								type="single"
								variant="outline"
								value={isEinkMode ? "on" : "off"}
								onValueChange={(v) => v && setEinkMode(v === "on")}
							>
								<ToggleGroupItem value="off">Off</ToggleGroupItem>
								<ToggleGroupItem value="on">On</ToggleGroupItem>
							</ToggleGroup>
						</div>
						{IS_VOLUME_KEYS_SUPPORTED && (
							<div className="ap-row">
								<span className="ap-row-label" id="ap-turn-pages-with-volume">
									Turn pages with volume
								</span>
								<ToggleGroup
									aria-labelledby="ap-turn-pages-with-volume"
									type="single"
									variant="outline"
									value={volumeKeys.enabled ? "on" : "off"}
									onValueChange={(v) => v && setVolumeKeyPageTurn(v === "on")}
								>
									<ToggleGroupItem value="off">Off</ToggleGroupItem>
									<ToggleGroupItem value="on">On</ToggleGroupItem>
								</ToggleGroup>
							</div>
						)}
						{IS_VOLUME_KEYS_SUPPORTED && volumeKeys.enabled && (
							<div className="ap-row">
								<span className="ap-row-label" id="ap-swap-page-direction">
									Swap page direction
								</span>
								<ToggleGroup
									aria-labelledby="ap-swap-page-direction"
									type="single"
									variant="outline"
									value={volumeKeys.invert ? "on" : "off"}
									onValueChange={(v) => v && setVolumeKeyInvert(v === "on")}
								>
									<ToggleGroupItem value="off">Off</ToggleGroupItem>
									<ToggleGroupItem value="on">On</ToggleGroupItem>
								</ToggleGroup>
							</div>
						)}
						<div className="ap-row">
							<span className="ap-row-label" id="ap-time-remaining">
								Time remaining
							</span>
							<ToggleGroup
								aria-labelledby="ap-time-remaining"
								type="single"
								variant="outline"
								value={showReadingTime ? "on" : "off"}
								onValueChange={(v) => v && setShowReadingTime(v === "on")}
							>
								<ToggleGroupItem value="off">Off</ToggleGroupItem>
								<ToggleGroupItem value="on">On</ToggleGroupItem>
							</ToggleGroup>
						</div>
						<div className="ap-row">
							<span className="ap-row-label" id="ap-underline-word">
								Underline word
							</span>
							<ToggleGroup
								aria-labelledby="ap-underline-word"
								type="single"
								variant="outline"
								value={showActiveWordUnderline ? "on" : "off"}
								onValueChange={(v) => v && setShowActiveWordUnderline(v === "on")}
							>
								<ToggleGroupItem value="off">Off</ToggleGroupItem>
								<ToggleGroupItem value="on">On</ToggleGroupItem>
							</ToggleGroup>
						</div>
						<div className="ap-row">
							<span className="ap-row-label" id="ap-glossary-highlights">
								Glossary highlights
							</span>
							<ToggleGroup
								aria-labelledby="ap-glossary-highlights"
								type="single"
								variant="outline"
								value={showGlossaryUnderline ? "on" : "off"}
								onValueChange={(v) => v && setShowGlossaryUnderline(v === "on")}
							>
								<ToggleGroupItem value="off">Off</ToggleGroupItem>
								<ToggleGroupItem value="on">On</ToggleGroupItem>
							</ToggleGroup>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
};

export default AppearancePopover;
