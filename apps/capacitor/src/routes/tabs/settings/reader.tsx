import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { ToggleRow } from "@/components/app-shell/toggle-row";
import { FontCards } from "@/components/appearance-pickers";
import { ModeCards, PAGINATION_STYLE_OPTIONS } from "@/components/rsvp-pickers";
import { SettingsRow } from "@/components/settings/settings-row";
import { SettingsSection } from "@/components/settings/settings-section";
import { StepperRow } from "@/components/settings/stepper-row";
import {
	DEFAULT_TEXT_SPACING,
	percentOfFont,
	spacingLabel,
	useAppearanceSettings,
} from "@/hooks/use-appearance-settings";
import ReaderPreview from "@/pages/settings/reader-preview";
import { IS_VOLUME_KEYS_SUPPORTED } from "@/services/volume-keys";

export const Route = createFileRoute("/tabs/settings/reader")({
	component: ReaderSettings,
});

const {
	READER_FONT_SIZE,
	READER_LINE_SPACING,
	READER_MARGIN,
	READER_LETTER_SPACING,
	READER_WORD_SPACING,
	READER_PARAGRAPH_SPACING,
} = SETTING_CONSTRAINTS;

function ReaderSettings() {
	const {
		fontSize,
		fontFamily,
		isBold,
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
		setPaginationStyle,
		setShowReadingTime,
		setShowActiveWordUnderline,
		setShowGlossaryUnderline,
		setPageTurnAnimation,
		setVolumeKeyPageTurn,
		setVolumeKeyInvert,
	} = useAppearanceSettings();

	return (
		<div className="bg-background">
			<PageHeader title="Reader" icon={BookOpen} />
			<div className="mx-auto max-w-2xl px-4 pt-4 pb-10">
				<ReaderPreview />

				<SettingsSection title="Text">
					<SettingsRow stacked>
						<FontCards value={fontFamily} onChange={setFontFamily} />
					</SettingsRow>
					<ToggleRow
						id="reader-bold"
						title="Bold text"
						checked={isBold}
						onCheckedChange={setBold}
					/>
					<StepperRow
						label="Text size"
						value={fontSize}
						display={`${fontSize}px`}
						min={READER_FONT_SIZE.min}
						max={READER_FONT_SIZE.max}
						step={READER_FONT_SIZE.step}
						onChange={(v) => adjustFontSize(v - fontSize)}
						decLabel="A−"
						incLabel="A+"
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
					<StepperRow
						label="Letter spacing"
						value={letterSpacing}
						display={spacingLabel(letterSpacing, DEFAULT_TEXT_SPACING.letter, percentOfFont)}
						min={READER_LETTER_SPACING.min}
						max={READER_LETTER_SPACING.max}
						step={READER_LETTER_SPACING.step}
						onChange={(v) => adjustLetterSpacing(v - letterSpacing)}
					/>
					<StepperRow
						label="Word spacing"
						value={wordSpacing}
						display={spacingLabel(wordSpacing, DEFAULT_TEXT_SPACING.word, percentOfFont)}
						min={READER_WORD_SPACING.min}
						max={READER_WORD_SPACING.max}
						step={READER_WORD_SPACING.step}
						onChange={(v) => adjustWordSpacing(v - wordSpacing)}
					/>
					<StepperRow
						label="Paragraph spacing"
						value={paragraphSpacing}
						display={spacingLabel(paragraphSpacing, DEFAULT_TEXT_SPACING.paragraph, (v) =>
							v.toFixed(1),
						)}
						min={READER_PARAGRAPH_SPACING.min}
						max={READER_PARAGRAPH_SPACING.max}
						step={READER_PARAGRAPH_SPACING.step}
						onChange={(v) => adjustParagraphSpacing(v - paragraphSpacing)}
					/>
					<div className="mt-2 flex">
						<button
							type="button"
							className="min-h-11 px-1 text-muted-foreground text-sm underline"
							onClick={resetTextSpacing}
						>
							Reset spacing
						</button>
					</div>
					<StepperRow
						label="Margins"
						value={margin}
						display={`${margin}px`}
						min={READER_MARGIN.min}
						max={READER_MARGIN.max}
						step={READER_MARGIN.step}
						onChange={(v) => adjustMargin(v - margin)}
					/>
				</SettingsSection>

				<SettingsSection title="Layout" hint={isEinkMode ? "(set by E-ink display)" : undefined}>
					<SettingsRow stacked>
						<ModeCards
							options={PAGINATION_STYLE_OPTIONS}
							value={paginationStyle}
							onChange={setPaginationStyle}
							disabled={isEinkMode}
						/>
					</SettingsRow>
					<ToggleRow
						id="page-turn-animation"
						title="Animate page turns"
						subtitle="Slide between pages in page mode. On this device only."
						checked={pageTurnAnimation}
						disabled={isEinkMode}
						onCheckedChange={setPageTurnAnimation}
					/>
				</SettingsSection>

				<SettingsSection title="While reading">
					<ToggleRow
						id="show-reading-time"
						title="Show time remaining"
						checked={showReadingTime}
						onCheckedChange={setShowReadingTime}
					/>
					<ToggleRow
						id="show-active-word"
						title="Underline active word"
						checked={showActiveWordUnderline}
						onCheckedChange={setShowActiveWordUnderline}
					/>
					<ToggleRow
						id="show-glossary-underline"
						title="Highlight glossary terms"
						checked={showGlossaryUnderline}
						onCheckedChange={setShowGlossaryUnderline}
					/>
				</SettingsSection>

				{IS_VOLUME_KEYS_SUPPORTED && (
					<SettingsSection title="Hardware buttons">
						<ToggleRow
							id="volume-key-page-turn"
							title="Turn pages with volume buttons"
							subtitle="Volume down goes forward. In RSVP they change speed. On this device only."
							checked={volumeKeys.enabled}
							onCheckedChange={setVolumeKeyPageTurn}
						/>
						<ToggleRow
							id="volume-key-invert"
							title="Swap page direction"
							subtitle="Volume up goes forward instead."
							checked={volumeKeys.invert}
							disabled={!volumeKeys.enabled}
							onCheckedChange={setVolumeKeyInvert}
						/>
					</SettingsSection>
				)}
			</div>
		</div>
	);
}
