import { DEFAULT_SETTINGS, SETTING_CONSTRAINTS } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { ToggleRow } from "@/components/app-shell/toggle-row";
import { ThemeCards } from "@/components/appearance-pickers";
import { ModeCards, READER_MODE_OPTIONS } from "@/components/rsvp-pickers";
import { SettingsRow } from "@/components/settings/settings-row";
import { SettingsSection } from "@/components/settings/settings-section";
import { StepperRow } from "@/components/settings/stepper-row";
import { useTheme } from "@/contexts/theme-context";
import { useAppearanceSettings } from "@/hooks/use-appearance-settings";
import { queryHooks } from "@/services/db/hooks";

export const Route = createFileRoute("/tabs/settings/general")({
	component: GeneralSettings,
});

const { APP_FONT_SIZE } = SETTING_CONSTRAINTS;

function GeneralSettings() {
	const { storedTheme, isEinkMode, setTheme } = useTheme();
	const { appFontSize, adjustAppFontSize, setEinkMode } = useAppearanceSettings();
	const { data: settings } = queryHooks.useSettings();
	const { mutate: saveSettings } = queryHooks.useSaveSettings();

	return (
		<div className="bg-background">
			<PageHeader title="General" icon={SlidersHorizontal} />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				<SettingsSection title="Theme">
					<SettingsRow stacked>
						<ThemeCards value={storedTheme} onChange={setTheme} disabled={isEinkMode} />
						{isEinkMode && (
							<p className="m-0 mt-3 text-muted-foreground text-xs">
								E-ink display is on and uses its own black-on-white look. Your theme comes back when
								you turn it off.
							</p>
						)}
					</SettingsRow>
				</SettingsSection>

				<SettingsSection title="Display">
					<StepperRow
						label="App text size"
						hint="Book text size is set under Reader"
						value={appFontSize}
						display={`${appFontSize}px`}
						min={APP_FONT_SIZE.min}
						max={APP_FONT_SIZE.max}
						step={APP_FONT_SIZE.step}
						onChange={(v) => adjustAppFontSize(v - appFontSize)}
						decLabel="A−"
						incLabel="A+"
					/>
					<ToggleRow
						id="eink-mode"
						title="E-ink display"
						subtitle="For e-readers: no animations, black on white, pages turn instantly. On this device only."
						checked={isEinkMode}
						onCheckedChange={setEinkMode}
					/>
				</SettingsSection>

				<SettingsSection title="Startup">
					<ToggleRow
						id="auto-open-last-book"
						title="Open last book on launch"
						subtitle="Skip the library and continue where you left off."
						checked={settings?.autoOpenLastBook ?? DEFAULT_SETTINGS.AUTO_OPEN_LAST_BOOK}
						onCheckedChange={(v) => saveSettings({ autoOpenLastBook: v })}
					/>
				</SettingsSection>

				<SettingsSection title="Reading mode" hint="(when opening a book)">
					<SettingsRow stacked>
						<ModeCards
							options={READER_MODE_OPTIONS}
							value={settings?.defaultReaderMode ?? DEFAULT_SETTINGS.DEFAULT_READER_MODE}
							onChange={(mode) => saveSettings({ defaultReaderMode: mode })}
						/>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
