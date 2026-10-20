import { describe, expect, it } from "vitest";
import type { TtsVoice } from "../index";
import {
	parseVoiceChoices,
	voiceFor,
	voiceLabels,
	voiceLanguageKey,
	voicesForLanguage,
	withVoice,
} from "../voices";

const voice = (name: string, language: string, extra: Partial<TtsVoice> = {}): TtsVoice => ({
	name,
	language,
	quality: 300,
	isNetwork: false,
	isInstalled: true,
	...extra,
});

describe("voice choices", () => {
	it("keys by primary language so one choice serves every book in it", () => {
		expect(voiceLanguageKey("de-AT")).toBe("de");
		expect(voiceLanguageKey("en_GB")).toBe("en");
		expect(voiceLanguageKey(null)).toBe("default");
		const choices = withVoice({}, "de-DE", "de-x-1");
		expect(voiceFor(choices, "de")).toBe("de-x-1");
		expect(voiceFor(withVoice(choices, "de", null), "de")).toBeNull();
	});

	it("reads only well-formed choices", () => {
		expect(parseVoiceChoices('{"de":"de-x-1","en":3}')).toEqual({ de: "de-x-1" });
		expect(parseVoiceChoices("not json")).toEqual({});
		expect(parseVoiceChoices("[]")).toEqual({});
	});

	it("lists a language's offline, installed, better voices first", () => {
		const voices = [
			voice("net", "de-DE", { isNetwork: true, quality: 500 }),
			voice("low", "de-DE", { quality: 200 }),
			voice("high", "de-DE", { quality: 400 }),
			voice("missing", "de-DE", { isInstalled: false, quality: 500 }),
			voice("english", "en-US"),
		];
		expect(voicesForLanguage(voices, "de").map((v) => v.name)).toEqual([
			"high",
			"low",
			"missing",
			"net",
		]);
	});

	it("labels voices by region, numbered within each", () => {
		const labels = voiceLabels([voice("a", "en-US"), voice("b", "en-GB"), voice("c", "en-US")]);
		expect([...labels.values()]).toEqual([
			"United States 1",
			"United Kingdom 1",
			"United States 2",
		]);
	});
});
