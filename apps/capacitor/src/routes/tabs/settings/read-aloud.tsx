import { DEFAULT_SETTINGS, SETTING_CONSTRAINTS } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { AudioLines, Download, Headphones, Settings2, Volume2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { ToggleRow } from "@/components/app-shell/toggle-row";
import { VoiceSheet } from "@/components/read-aloud/voice-sheet";
import { NavRow } from "@/components/settings/settings-row";
import { SettingsSection } from "@/components/settings/settings-section";
import { SliderRow } from "@/components/settings/slider-row";
import { StepperRow } from "@/components/settings/stepper-row";
import { useAutoSaveSettings } from "@/hooks/use-auto-save-settings";
import { queryHooks } from "@/services/db/hooks";
import { ttsEngine } from "@/services/tts";
import { useTtsVoices } from "@/services/tts/use-voices";
import {
	languageName,
	parseVoiceChoices,
	speechFor,
	voiceFor,
	voiceLabels,
	voiceLanguageKey,
	voicesForLanguage,
	withVoice,
} from "@/services/tts/voices";

export const Route = createFileRoute("/tabs/settings/read-aloud")({
	component: ReadAloudSettings,
});

const { TTS_WPM, TTS_PITCH, TTS_REWIND_WORDS } = SETTING_CONSTRAINTS;

function ReadAloudSettings() {
	const { settings, updateSetting } = useAutoSaveSettings();
	const { data: library } = queryHooks.useBooks();
	const { data: voices = [] } = useTtsVoices();
	const [voiceSheet, setVoiceSheet] = useState<{ language: string | null } | null>(null);

	const choices = parseVoiceChoices(settings?.ttsVoices ?? DEFAULT_SETTINGS.TTS_VOICES);
	const speech = speechFor(settings, null);

	// One row per language in the library, so a voice can be picked before opening a book.
	const languages = useMemo(() => {
		const byKey = new Map<string, string>();
		for (const book of library?.books ?? []) {
			if (book.language) byKey.set(voiceLanguageKey(book.language), book.language);
		}
		return [...byKey.values()].sort((a, b) => languageName(a).localeCompare(languageName(b)));
	}, [library]);

	const selectedLabel = (language: string | null) => {
		const name = voiceFor(choices, language);
		if (!name) return "Speech engine default";
		return voiceLabels(voicesForLanguage(voices, language)).get(name) ?? "Chosen voice";
	};

	const sheetLanguage = voiceSheet?.language ?? null;

	return (
		<div className="bg-background">
			<PageHeader title="Read aloud" icon={Headphones} />
			<div className="mx-auto max-w-2xl px-4 pt-4 pb-10">
				<SettingsSection title="Voice">
					<SliderRow
						label="Speed"
						value={speech.wpm}
						display={`${speech.wpm} wpm`}
						min={TTS_WPM.min}
						max={TTS_WPM.max}
						step={TTS_WPM.step}
						onChange={(wpm) => updateSetting("ttsWpm", wpm)}
					/>
					<SliderRow
						label="Pitch"
						value={speech.pitch}
						display={`${speech.pitch.toFixed(1)}×`}
						min={TTS_PITCH.min}
						max={TTS_PITCH.max}
						step={TTS_PITCH.step}
						onChange={(pitch) => updateSetting("ttsPitch", Math.round(pitch * 10) / 10)}
					/>
					<NavRow
						icon={Volume2}
						title="Play a sample"
						subtitle="Hear the current speed and pitch"
						onClick={() =>
							void ttsEngine.speakSample("This is how your books will sound.", null, speech)
						}
					/>
				</SettingsSection>

				<SettingsSection title="While listening">
					<ToggleRow
						title="Follow the text"
						subtitle="Keep the spoken word on screen"
						checked={settings?.ttsFollow ?? DEFAULT_SETTINGS.TTS_FOLLOW}
						onCheckedChange={(follow) => updateSetting("ttsFollow", follow)}
					/>
					<StepperRow
						label="Repeat after an interruption"
						hint="Words read again after a call, a navigation prompt or a disconnect"
						value={speech.rewindWords}
						display={`${speech.rewindWords} words`}
						min={TTS_REWIND_WORDS.min}
						max={TTS_REWIND_WORDS.max}
						step={TTS_REWIND_WORDS.step}
						onChange={(words) => updateSetting("ttsRewindWords", words)}
					/>
				</SettingsSection>

				<SettingsSection
					title="Voices"
					hint="From your phone's speech engine, offline once downloaded"
				>
					{[null, ...languages].map((language) => (
						<NavRow
							key={language ?? "default"}
							icon={AudioLines}
							title={languageName(language)}
							subtitle={selectedLabel(language)}
							onClick={() => setVoiceSheet({ language })}
						/>
					))}
					<NavRow
						icon={Download}
						title="Download voices"
						subtitle="More languages and better voices"
						onClick={() => void ttsEngine.installVoiceData()}
					/>
					<NavRow
						icon={Settings2}
						title="System speech settings"
						subtitle="Speech engine, default language"
						onClick={() => void ttsEngine.openSystemSettings()}
					/>
				</SettingsSection>
			</div>

			<VoiceSheet
				open={voiceSheet !== null}
				onOpenChange={(open) => {
					if (!open) setVoiceSheet(null);
				}}
				language={sheetLanguage}
				languageLabel={languageName(sheetLanguage)}
				selected={voiceFor(choices, sheetLanguage)}
				speech={speech}
				onSelect={(voice) => {
					updateSetting("ttsVoices", JSON.stringify(withVoice(choices, sheetLanguage, voice)));
					setVoiceSheet(null);
				}}
			/>
		</div>
	);
}
