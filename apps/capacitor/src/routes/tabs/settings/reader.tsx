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
import { useAppearanceSettings } from "@/hooks/use-appearance-settings";
import ReaderPreview from "@/pages/settings/reader-preview";

export const Route = createFileRoute("/tabs/settings/reader")({
	component: ReaderSettings,
});

const { READER_FONT_SIZE, READER_LINE_SPACING, READER_MARGIN } = SETTING_CONSTRAINTS;

function ReaderSettings() {
	const {
		fontSize,
		fontFamily,
		lineSpacing,
		margin,
		paginationStyle,
		showReadingTime,
		showActiveWordUnderline,
		showGlossaryUnderline,
		pageTurnAnimation,
		isEinkMode,
		adjustFontSize,
		adjustLineSpacing,
		adjustMargin,
		setFontFamily,
		setPaginationStyle,
		setShowReadingTime,
		setShowActiveWordUnderline,
		setShowGlossaryUnderline,
		setPageTurnAnimation,
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
			</div>
		</div>
	);
}
