import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAutoSaveSettings } from "../../hooks/use-auto-save-settings";
import { queryHooks } from "../../services/db/hooks";
import {
	countWords,
	isPlausibleWpm,
	rsvpDelays,
	rsvpWpm as rsvpWpmOf,
	suggestDial,
} from "../../services/stats/speed-test";
import { SpeedGauge } from "./gauge";
import { pickPassage, type SpeedTestPassage } from "./passages";
import { ReadRound } from "./read-round";
import { SpeedTestResult } from "./result";
import { type RsvpProgress, RsvpRound } from "./rsvp-round";

export type SpeedTestAction = { label: string; onClick: () => void; disabled?: boolean };
export type SpeedTestActions = { primary: SpeedTestAction; secondary?: SpeedTestAction };

type Phase = "intro" | "read" | "implausible" | "rsvp" | "result";
type ActionId = "start" | "skip" | "done" | "retry" | "keep" | "seeResult" | "skipRound" | "finish";
type ActionSpec = { id: ActionId; label: string; disabled?: boolean };

interface Props {
	/** A host with its own footer takes the actions; without one the test renders them. */
	onActions?: (actions: SpeedTestActions) => void;
	onSkip: () => void;
	onFinish: () => void;
	skipLabel: string;
	finishLabel: string;
}

const STEPS = ["Read", "RSVP", "Result"] as const;

function stepIndex(phase: Phase): number {
	if (phase === "rsvp") return 1;
	if (phase === "result") return 2;
	return 0;
}

export function SpeedTest({ onActions, onSkip, onFinish, skipLabel, finishLabel }: Props) {
	const { settings, updateSetting } = useAutoSaveSettings();
	const lastPassageId = queryHooks.useSpeedTests().data?.[0]?.passageId;
	const saveTest = queryHooks.useSaveSpeedTest();

	const [phase, setPhase] = useState<Phase>("intro");
	const [passage, setPassage] = useState<SpeedTestPassage | null>(null);
	const [readStartedAt, setReadStartedAt] = useState<number | null>(null);
	const [readingWpm, setReadingWpm] = useState(0);
	const [progress, setProgress] = useState<RsvpProgress>({ shown: 0, playing: false });
	const [rsvpWpm, setRsvpWpm] = useState<number | null>(null);
	const [dial, setDial] = useState(0);
	const [appliedDial, setAppliedDial] = useState<number | null>(null);
	const saved = useRef(false);

	const roundDial = suggestDial(readingWpm);
	const rsvpSettings = useMemo(
		() => (settings ? { ...settings, wpm: roundDial } : null),
		[settings, roundDial],
	);
	const rsvpWords = useMemo(() => (passage ? passage.rsvp.split(/\s+/) : []), [passage]);
	const readWords = useMemo(() => (passage ? countWords(passage.read.join(" ")) : 0), [passage]);

	const showResult = useCallback(
		(rsvp: number | null) => {
			setRsvpWpm(rsvp);
			setDial(roundDial);
			setPhase("result");
			if (saved.current || !passage) return;
			saved.current = true;
			saveTest.mutate({ readingWpm, rsvpWpm: rsvp, passageId: passage.id });
		},
		[roundDial, passage, readingWpm, saveTest],
	);

	const handlers = useRef<Record<ActionId, () => void>>({} as Record<ActionId, () => void>);
	handlers.current = {
		start: () => {
			setPassage(pickPassage(lastPassageId));
			setPhase("read");
		},
		skip: onSkip,
		done: () => {
			if (readStartedAt === null) return;
			const minutes = Math.max(1, Date.now() - readStartedAt) / 60_000;
			const wpm = Math.max(1, Math.round(readWords / minutes));
			setReadingWpm(wpm);
			setPhase(isPlausibleWpm(wpm) ? "rsvp" : "implausible");
		},
		retry: () => {
			setPassage((current) => pickPassage(current?.id ?? lastPassageId));
			setReadStartedAt(null);
			setProgress({ shown: 0, playing: false });
			setPhase("read");
		},
		keep: () => setPhase("rsvp"),
		seeResult: () => {
			const delays = rsvpSettings ? rsvpDelays(rsvpWords, rsvpSettings) : [];
			showResult(rsvpWpmOf(delays, progress.shown));
		},
		skipRound: () => showResult(null),
		finish: () => {
			if (appliedDial !== dial) updateSetting("wpm", dial);
			onFinish();
		},
	};

	const spec = actionSpec(phase, {
		begun: readStartedAt !== null,
		skipLabel,
		finishLabel,
	});
	const specKey = JSON.stringify(spec);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the key is the spec's content
	const actions = useMemo<SpeedTestActions>(() => {
		const wire = (a: ActionSpec): SpeedTestAction => ({
			label: a.label,
			disabled: a.disabled,
			onClick: () => handlers.current[a.id](),
		});
		return { primary: wire(spec.primary), secondary: spec.secondary && wire(spec.secondary) };
	}, [specKey]);

	useEffect(() => {
		onActions?.(actions);
	}, [actions, onActions]);

	if (!settings) return null;

	return (
		<div className="flex flex-col" data-testid="speed-test">
			{phase !== "intro" && (
				<div className="mb-4">
					<ol className="flex items-center gap-3 text-xs" aria-label="Speed test steps">
						{STEPS.map((step, i) => (
							<li
								key={step}
								aria-current={i === stepIndex(phase) ? "step" : undefined}
								className={cn(
									i === stepIndex(phase)
										? "font-semibold text-foreground"
										: "text-muted-foreground",
								)}
							>
								{step}
							</li>
						))}
					</ol>
				</div>
			)}

			{phase === "intro" && (
				<div className="text-center">
					<h2 className="font-semibold text-2xl tracking-tight">How fast do you read?</h2>
					<div className="mt-6">
						<SpeedGauge value="?" label="wpm" animate={false} />
					</div>
					<div className="mt-4 grid grid-cols-3 gap-2">
						<IntroStat value="1 min" label="Time" />
						<IntroStat value="2" label="Rounds" />
						<IntroStat value="Read · RSVP" label="Modes" />
					</div>
				</div>
			)}

			{phase === "read" && passage && (
				<ReadRound
					paragraphs={passage.read}
					words={readWords}
					begun={readStartedAt !== null}
					onBegin={() => setReadStartedAt(Date.now())}
				/>
			)}

			{phase === "implausible" && (
				<div className="text-center" data-testid="speed-test-implausible">
					<h2 className="font-semibold text-2xl tracking-tight">Try again?</h2>
					<p className="mt-2 text-muted-foreground tabular-nums">
						{readingWpm} wpm. Usual: 120 to 900.
					</p>
				</div>
			)}

			{phase === "rsvp" && rsvpSettings && (
				<RsvpRound
					words={rsvpWords}
					settings={rsvpSettings}
					readingWpm={readingWpm}
					progress={progress}
					onProgress={setProgress}
				/>
			)}

			{phase === "result" && (
				<SpeedTestResult
					readingWpm={readingWpm}
					rsvpWpm={rsvpWpm}
					dial={dial}
					appliedDial={appliedDial}
					onDialChange={setDial}
					onApply={() => {
						updateSetting("wpm", dial);
						setAppliedDial(dial);
					}}
				/>
			)}

			{!onActions && (
				<div className="mt-6 flex flex-col gap-2">
					<Button size="lg" onClick={actions.primary.onClick} disabled={actions.primary.disabled}>
						{actions.primary.label}
					</Button>
					{actions.secondary && (
						<Button
							size="lg"
							variant="outline"
							onClick={actions.secondary.onClick}
							disabled={actions.secondary.disabled}
						>
							{actions.secondary.label}
						</Button>
					)}
				</div>
			)}
		</div>
	);
}

function IntroStat({ value, label }: { value: string; label: string }) {
	return (
		<div className="rounded-lg border border-border px-2 py-2">
			<div className="font-semibold tabular-nums">{value}</div>
			<div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
		</div>
	);
}

function actionSpec(
	phase: Phase,
	opts: { begun: boolean; skipLabel: string; finishLabel: string },
): { primary: ActionSpec; secondary?: ActionSpec } {
	switch (phase) {
		case "intro":
			return {
				primary: { id: "start", label: "Start" },
				secondary: { id: "skip", label: opts.skipLabel },
			};
		case "read":
			return { primary: { id: "done", label: "Done", disabled: !opts.begun } };
		case "implausible":
			return {
				primary: { id: "retry", label: "Try again" },
				secondary: { id: "keep", label: "Keep result" },
			};
		case "rsvp":
			return {
				primary: { id: "seeResult", label: "See result" },
				secondary: { id: "skipRound", label: "Skip round" },
			};
		case "result":
			return { primary: { id: "finish", label: opts.finishLabel } };
	}
}
