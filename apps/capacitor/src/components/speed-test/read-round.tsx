import { cn } from "@lesefluss/ui/utils";

interface Props {
	paragraphs: readonly string[];
	words: number;
	begun: boolean;
	onBegin: () => void;
}

/** Round 1: the passage behind a veil, so the clock starts with the first line read. */
export function ReadRound({ paragraphs, words, begun, onBegin }: Props) {
	return (
		<div>
			<div className="relative">
				<div
					className={cn(
						"space-y-4 font-serif text-[1.125rem] leading-relaxed",
						!begun && "select-none blur-sm",
					)}
					aria-hidden={!begun}
					data-testid="speed-test-passage"
				>
					{paragraphs.map((p) => (
						<p key={p.slice(0, 24)}>{p}</p>
					))}
				</div>
				{!begun && (
					<button
						type="button"
						onClick={onBegin}
						className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg bg-background/60 text-center"
					>
						<span className="text-[0.6875rem] text-muted-foreground uppercase tracking-wider">
							Round 1
						</span>
						<span className="font-semibold text-lg">Read normally</span>
						<span className="text-muted-foreground text-sm">Tap to begin</span>
					</button>
				)}
			</div>
			<p className="mt-4 text-center text-muted-foreground text-xs tabular-nums">{words} words</p>
		</div>
	);
}
