import { type CSSProperties, useRef } from "react";
import { useTheme } from "../../contexts/theme-context";
import {
	effectiveTextAlign,
	readerFontStack,
	textAlignVars,
	textSpacingVars,
	useAppearanceSettings,
} from "../../hooks/use-appearance-settings";
import { useElementWidth } from "../../hooks/use-element-width";

// Short enough that the gaps between paragraphs show inside the card.
const BEFORE = "The morning light crept across the old wooden floor. She";
const ACTIVE = "opened";
const AFTER = "the first book and began to read.";
const MORE = ["By noon the tea had gone cold beside her.", "She turned the page."];

/** Static sample paragraphs rendered with the reader's own `.reader-paragraph` styles. */
export default function ReaderPreview() {
	const { theme } = useTheme();
	const {
		fontSize,
		fontFamily,
		isBold,
		textAlign,
		lineSpacing,
		margin,
		letterSpacing,
		wordSpacing,
		paragraphSpacing,
		showActiveWordUnderline,
	} = useAppearanceSettings();
	const textRef = useRef<HTMLDivElement>(null);
	const align = effectiveTextAlign(
		textAlign,
		useElementWidth(textRef) - 2 * margin,
		fontSize,
		letterSpacing,
	);

	return (
		<div
			// A fixed window onto the text: cutting it off is the point (e2e layout check).
			data-clips-text
			className={`reader-theme-${theme} h-52 overflow-hidden rounded-[10px] border border-border bg-(--reader-bg)`}
			data-testid="reader-preview"
		>
			<span className="block px-2.5 pt-1.5 font-semibold text-[0.68rem] text-muted-foreground uppercase tracking-[0.08em]">
				Preview
			</span>
			<div
				ref={textRef}
				lang="en"
				style={
					{
						padding: `8px ${margin}px 0`,
						fontSize: `${fontSize}px`,
						fontFamily: readerFontStack(fontFamily),
						"--reader-line-height": String(lineSpacing),
						...(isBold && { "--reader-font-weight": "700" }),
						...textSpacingVars({
							letter: letterSpacing,
							word: wordSpacing,
							paragraph: paragraphSpacing,
						}),
						...textAlignVars(align),
					} as CSSProperties
				}
			>
				<p className="reader-paragraph">
					{BEFORE}{" "}
					<span className={showActiveWordUnderline ? "word-active" : undefined}>{ACTIVE}</span>{" "}
					{AFTER}
				</p>
				{MORE.map((text) => (
					<p key={text} className="reader-paragraph">
						{text}
					</p>
				))}
			</div>
		</div>
	);
}
