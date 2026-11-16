import { BookOpen, Undo2 } from "lucide-react";
import { formatPercent } from "@/utils/format-percent";

type Props = {
	anchorPct: number;
	onBack: () => void;
	onReadFromHere: () => void;
};

export function BrowseBar({ anchorPct, onBack, onReadFromHere }: Props) {
	return (
		<fieldset
			className="reader-browse-bar"
			data-toast-clear
			aria-label="Browsing, position not saved"
			data-testid="browse-bar"
		>
			<button type="button" onClick={onBack} data-testid="browse-back">
				<Undo2 aria-hidden />
				<span>Back to {formatPercent(anchorPct)}</span>
			</button>
			<span className="reader-browse-bar-divider" aria-hidden />
			<button type="button" onClick={onReadFromHere} data-testid="browse-read-from-here">
				<BookOpen aria-hidden />
				<span>Read from here</span>
			</button>
		</fieldset>
	);
}
