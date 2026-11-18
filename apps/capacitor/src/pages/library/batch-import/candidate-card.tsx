import { Badge } from "@lesefluss/ui/badge";
import { cn } from "@lesefluss/ui/utils";
import { BookOpen, Check } from "lucide-react";
import type React from "react";
import { CARD_TITLE } from "@/components/card";
import { formatBytes } from "../transfer-modal/utils";
import { type Candidate, candidateTitle } from "./candidates";

type Props = {
	candidate: Candidate;
	isDuplicate: boolean;
	onToggle: () => void;
};

const CandidateCard: React.FC<Props> = ({ candidate, isDuplicate, onToggle }) => {
	const { file, probe, selected } = candidate;
	const title = candidateTitle(candidate);

	return (
		<button
			type="button"
			onClick={onToggle}
			aria-pressed={selected}
			data-testid="batch-import-candidate"
			className="flex cursor-pointer select-none flex-col text-left active:opacity-70"
		>
			<div className="relative aspect-2/3 w-full overflow-hidden rounded-sm border border-border bg-muted">
				{probe?.coverImage ? (
					<img
						src={probe.coverImage}
						alt=""
						// A long-press on a draggable image wedges touch dispatch in the
						// WebView, and this grid is tap-heavy.
						draggable={false}
						className="size-full object-cover"
					/>
				) : (
					<div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
						<BookOpen className="size-6" />
						<span className="font-medium text-2xs uppercase">{file.format}</span>
					</div>
				)}

				<span
					className={`absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full border ${
						selected
							? "border-primary bg-primary text-primary-foreground"
							: "border-border bg-background/80"
					}`}
				>
					{selected && <Check className="size-3.5" />}
				</span>

				{!selected && <div className="absolute inset-0 bg-background/60" />}
			</div>

			{/* Title and author keep their space whether or not the probe has landed:
			    a card that grows when its metadata arrives shifts every row below it,
			    and probing runs one file at a time across the whole grid. */}
			<div className="px-0.5 pt-1">
				<div className={cn(CARD_TITLE, "min-h-[2.5em]")}>{title}</div>
				<div className="mt-0.5 min-h-[1.2em] truncate text-muted-foreground text-xs">
					{probe?.author ?? ""}
				</div>
				<div className="mt-0.5 flex items-center gap-2 text-2xs text-muted-foreground">
					<span className="uppercase">{file.format}</span>
					<span>·</span>
					<span className="tabular-nums">{formatBytes(file.size)}</span>
				</div>
				{isDuplicate && (
					<Badge variant="secondary" className="mt-1 text-2xs">
						Already in library
					</Badge>
				)}
			</div>
		</button>
	);
};

export default CandidateCard;
