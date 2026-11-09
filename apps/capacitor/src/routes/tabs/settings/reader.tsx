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
import { TextSpacingRows } from "@/components/settings/text-spacing-rows";
import {
	PAGE_TURN_REDUCE_MOTION_HINT,
	useAppearanceSettings,
} from "@/hooks/use-appearance-settings";
import ReaderPreview from "@/pages/settings/reader-preview";
import { IS_VOLUME_KEYS_SUPPORTED } from "@/services/volume-keys";

export const Route = createFileRoute("/tabs/settings/reader")({
	component: ReaderSettings,
});

const { READER_FONT_SIZE, READER_LINE_SPACING, READER_MARGIN, READER_RULER_LINES } =
	SETTING_CONSTRAINTS;

function ReaderSettings() {
	const {
		fontSize,
		fontFamily,
		isBold,
		textAlign,
		readingRuler,
		lineSpacing,
		margin,
		paginationStyle,
		showReadingTime,
		showLiveWpm,
		showActiveWordUnderline,
		showGlossaryUnderline,
		pageTurnAnimation,
		pageTurnAnimationOffBy,
		isEinkMode,
		volumeKeys,
		adjustFontSize,
		adjustLineSpacing,
		adjustMargin,
		setFontFamily,
		setBold,
		setTextAlign,
		setReadingRuler,
		setReadingRulerLines,
		setPaginationStyle,
		setShowReadingTime,
		setShowLiveWpm,
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
					<ToggleRow
						id="reader-justify"
						title="Justify text"
						subtitle="Straight edges on both sides. Hyphenates long words."
						checked={textAlign === "justify"}
						onCheckedChange={(on) => setTextAlign(on ? "justify" : "left")}
					/>
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
						id="reading-ruler"
						title="Reading ruler"
						subtitle="Marks the line you are on and dims the rest. Follows read aloud."
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
						subtitle={
							pageTurnAnimationOffBy === "reduce-motion"
								? PAGE_TURN_REDUCE_MOTION_HINT
								: "Slide between pages in page mode. On this device only."
						}
						checked={pageTurnAnimation}
						disabled={pageTurnAnimationOffBy !== null}
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
						id="show-live-wpm"
						title="Show live speed"
						subtitle="Words per minute of this sitting, in scroll and page mode."
						checked={showLiveWpm}
						onCheckedChange={setShowLiveWpm}
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
