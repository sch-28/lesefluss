import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { cn } from "@lesefluss/ui/utils";
import { Check, Download, Settings2, Volume2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { type ReadAloudSpeech, ttsEngine } from "../../services/tts";
import { useTtsVoices } from "../../services/tts/use-voices";
import { voiceLabels, voiceLanguageKey, voicesForLanguage } from "../../services/tts/voices";

const SAMPLE_TEXT: Record<string, string> = {
	de: "So klingt diese Stimme, wenn sie dir vorliest.",
	en: "This is how this voice sounds when it reads to you.",
	fr: "Voici comment cette voix vous fait la lecture.",
	es: "Así suena esta voz cuando te lee.",
};

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The book's language; null lists every voice for the device default. */
	language: string | null;
	/** Shown in the title, e.g. "German". */
	languageLabel: string;
	selected: string | null;
	speech: ReadAloudSpeech;
	onSelect: (voice: string | null) => void;
	/** Sheet classes, e.g. the reader theme. */
	className?: string;
}

export const VoiceSheet: React.FC<Props> = ({
	open,
	onOpenChange,
	language,
	languageLabel,
	selected,
	speech,
	onSelect,
	className,
}) => {
	const { data: voices = [], isPending } = useTtsVoices(open);
	const [isShowingOnline, setIsShowingOnline] = useState(false);
	const forLanguage = voicesForLanguage(voices, language);
	const labels = voiceLabels(forLanguage);
	// Online voices stop working without a connection, the car's usual state.
	const onlineCount = forLanguage.filter((v) => v.isNetwork).length;
	const listed = forLanguage.filter((v) => isShowingOnline || !v.isNetwork || v.name === selected);
	const sample = SAMPLE_TEXT[voiceLanguageKey(language)] ?? SAMPLE_TEXT.en;

	const preview = (voice: string | null) =>
		void ttsEngine.speakSample(sample, language, { ...speech, voice });

	const row = (key: string, label: string, detail: string | null, voice: string | null) => (
		<li key={key} className="flex items-center gap-1 border-border border-b">
			<button
				type="button"
				onClick={() => onSelect(voice)}
				className={cn(
					"flex min-w-0 flex-1 items-center gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-muted",
					selected === voice && "font-medium",
				)}
			>
				<Check className={cn("size-4 shrink-0", selected !== voice && "invisible")} />
				<span className="min-w-0 flex-1">
					<span className="block truncate">{label}</span>
					{detail && <span className="block text-muted-foreground text-xs">{detail}</span>}
				</span>
			</button>
			<button
				type="button"
				onClick={() => preview(voice)}
				aria-label={`Play a sample of ${label}`}
				className="mr-3 rounded-md p-2 text-muted-foreground hover:bg-muted"
			>
				<Volume2 className="size-4" />
			</button>
		</li>
	);

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className={className}>
				<DrawerHeader className="border-border border-b">
					<DrawerTitle className="text-center">Voice · {languageLabel}</DrawerTitle>
				</DrawerHeader>
				<div className="max-h-[60vh] overflow-y-auto">
					<ul className="flex flex-col">
						{row("default", "Speech engine default", null, null)}
						{listed.map((voice) =>
							row(
								voice.name,
								labels.get(voice.name) ?? voice.name,
								[
									voice.isNetwork ? "Online" : "Offline",
									voice.isInstalled ? null : "not downloaded",
								]
									.filter(Boolean)
									.join(" · "),
								voice.name,
							),
						)}
					</ul>
					{onlineCount > 0 && (
						<button
							type="button"
							onClick={() => setIsShowingOnline((shown) => !shown)}
							className="w-full px-5 py-3 text-left text-muted-foreground text-sm hover:bg-muted"
						>
							{isShowingOnline ? "Hide online voices" : `Show online voices (${onlineCount})`}
						</button>
					)}
					{!isPending && listed.length === 0 && (
						<p className="px-5 py-4 text-muted-foreground text-sm">
							No voice for this language yet. Download one below.
						</p>
					)}
				</div>
				<div className="flex flex-col p-2">
					<button
						type="button"
						onClick={() => void ttsEngine.installVoiceData()}
						className="flex h-12 items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-muted"
					>
						<Download className="size-5 shrink-0" />
						Download voices
					</button>
					<button
						type="button"
						onClick={() => void ttsEngine.openSystemSettings()}
						className="flex h-12 items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-muted"
					>
						<Settings2 className="size-5 shrink-0" />
						System speech settings
					</button>
				</div>
			</DrawerContent>
		</Drawer>
	);
};
