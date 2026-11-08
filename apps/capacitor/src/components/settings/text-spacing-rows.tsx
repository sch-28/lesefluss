import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import {
	DEFAULT_TEXT_SPACING,
	percentOfFont,
	spacingLabel,
	useAppearanceSettings,
} from "../../hooks/use-appearance-settings";
import { StepperRow } from "./stepper-row";

const { READER_LETTER_SPACING, READER_WORD_SPACING, READER_PARAGRAPH_SPACING } =
	SETTING_CONSTRAINTS;

/** Letter, word and paragraph spacing with their reset, shared by Settings › Reader and the reader's Appearance. */
export function TextSpacingRows() {
	const {
		letterSpacing,
		wordSpacing,
		paragraphSpacing,
		adjustLetterSpacing,
		adjustWordSpacing,
		adjustParagraphSpacing,
		resetTextSpacing,
	} = useAppearanceSettings();

	return (
		<>
			<StepperRow
				label="Letter spacing"
				value={letterSpacing}
				display={spacingLabel(letterSpacing, DEFAULT_TEXT_SPACING.letter, percentOfFont)}
				min={READER_LETTER_SPACING.min}
				max={READER_LETTER_SPACING.max}
				step={READER_LETTER_SPACING.step}
				onChange={(v) => adjustLetterSpacing(v - letterSpacing)}
			/>
			<StepperRow
				label="Word spacing"
				value={wordSpacing}
				display={spacingLabel(wordSpacing, DEFAULT_TEXT_SPACING.word, percentOfFont)}
				min={READER_WORD_SPACING.min}
				max={READER_WORD_SPACING.max}
				step={READER_WORD_SPACING.step}
				onChange={(v) => adjustWordSpacing(v - wordSpacing)}
			/>
			<StepperRow
				label="Paragraph spacing"
				value={paragraphSpacing}
				display={spacingLabel(paragraphSpacing, DEFAULT_TEXT_SPACING.paragraph, (v) =>
					v.toFixed(1),
				)}
				min={READER_PARAGRAPH_SPACING.min}
				max={READER_PARAGRAPH_SPACING.max}
				step={READER_PARAGRAPH_SPACING.step}
				onChange={(v) => adjustParagraphSpacing(v - paragraphSpacing)}
			/>
			<div className="mt-2 flex">
				<button
					type="button"
					className="min-h-11 px-1 text-muted-foreground text-sm underline"
					onClick={resetTextSpacing}
				>
					Reset spacing
				</button>
			</div>
		</>
	);
}
