import { DEFAULT_SETTINGS } from "@lesefluss/core";
import type { Settings } from "../db/schema";
import type { ReadAloudSpeech, TtsVoice } from "./index";

/** Choices are keyed by primary language ("de"), so a voice picked for one German book serves every German book. */
export type VoiceChoices = Record<string, string>;

const DEVICE_DEFAULT_KEY = "default";

export function voiceLanguageKey(language: string | null): string {
	const primary = language?.split(/[-_]/)[0]?.toLowerCase();
	return primary || DEVICE_DEFAULT_KEY;
}

/** Tolerates a hand-edited or truncated column: anything unreadable is no choice at all. */
export function parseVoiceChoices(json: string): VoiceChoices {
	try {
		const parsed: unknown = JSON.parse(json);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			),
		);
	} catch {
		return {};
	}
}

export function voiceFor(choices: VoiceChoices, language: string | null): string | null {
	return choices[voiceLanguageKey(language)] ?? null;
}

export function withVoice(
	choices: VoiceChoices,
	language: string | null,
	voice: string | null,
): VoiceChoices {
	const key = voiceLanguageKey(language);
	const { [key]: _, ...rest } = choices;
	return voice ? { ...rest, [key]: voice } : rest;
}

/** Voices for the language, offline and installed first, then by quality. */
export function voicesForLanguage(
	voices: readonly TtsVoice[],
	language: string | null,
): TtsVoice[] {
	const key = voiceLanguageKey(language);
	return voices
		.filter((v) => key === DEVICE_DEFAULT_KEY || voiceLanguageKey(v.language) === key)
		.sort(
			(a, b) =>
				Number(a.isNetwork) - Number(b.isNetwork) ||
				Number(b.isInstalled) - Number(a.isInstalled) ||
				b.quality - a.quality ||
				a.name.localeCompare(b.name),
		);
}

/**
 * Engines name voices like "en-us-x-iob-local"; people want "United States 2".
 * Numbered per region in list order, so pass the same sorted list everywhere.
 */
export function voiceLabels(voices: readonly TtsVoice[]): Map<string, string> {
	const counts = new Map<string, number>();
	const labels = new Map<string, string>();
	for (const voice of voices) {
		const place = regionName(voice.language) ?? languageName(voice.language);
		const n = (counts.get(place) ?? 0) + 1;
		counts.set(place, n);
		labels.set(voice.name, `${place} ${n}`);
	}
	return labels;
}

function regionName(language: string): string | null {
	const region = language.split("-")[1];
	if (!region) return null;
	try {
		return new Intl.DisplayNames(["en"], { type: "region" }).of(region.toUpperCase()) ?? null;
	} catch {
		return null;
	}
}

/** "German" for "de-DE", in English like the rest of the app. */
export function languageName(language: string | null): string {
	if (!language) return "Device default";
	try {
		return new Intl.DisplayNames(["en"], { type: "language" }).of(language) ?? language;
	} catch {
		return language;
	}
}

/** The speech settings in effect for a book's language. */
export function speechFor(
	settings: Pick<Settings, "ttsWpm" | "ttsPitch" | "ttsVoices" | "ttsRewindWords"> | undefined,
	language: string | null,
): ReadAloudSpeech {
	return {
		wpm: settings?.ttsWpm ?? DEFAULT_SETTINGS.TTS_WPM,
		pitch: settings?.ttsPitch ?? DEFAULT_SETTINGS.TTS_PITCH,
		voice: voiceFor(
			parseVoiceChoices(settings?.ttsVoices ?? DEFAULT_SETTINGS.TTS_VOICES),
			language,
		),
		rewindWords: settings?.ttsRewindWords ?? DEFAULT_SETTINGS.TTS_REWIND_WORDS,
	};
}
