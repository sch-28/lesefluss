import type React from "react";
import { useTheme } from "../../contexts/theme-context";
import { readerFontStack, useAppearanceSettings } from "../../hooks/use-appearance-settings";

const BEFORE =
	"The morning light crept slowly across the old wooden floor, settling on the stack of books by the window. She";
const ACTIVE = "opened";
const AFTER =
	"the first one and began to read, the quiet hours folding into pages as the street outside woke up.";

/** Static sample paragraph rendered with the reader's own `.reader-paragraph` styles. */
export default function ReaderPreview() {
	const { theme } = useTheme();
	const { fontSize, fontFamily, lineSpacing, margin, showActiveWordUnderline } =
		useAppearanceSettings();

	return (
		<div
			className={`reader-theme-${theme} h-52 overflow-hidden rounded-[10px] border border-border bg-(--reader-bg)`}
			data-testid="reader-preview"
		>
			<span className="block px-2.5 pt-1.5 font-semibold text-[0.68rem] text-muted-foreground uppercase tracking-[0.08em]">
				Preview
			</span>
			<div
				style={
					{
						padding: `8px ${margin}px 0`,
						fontSize: `${fontSize}px`,
						fontFamily: readerFontStack(fontFamily),
						"--reader-line-height": String(lineSpacing),
					} as React.CSSProperties
				}
			>
				<p className="reader-paragraph">
					{BEFORE}{" "}
					<span className={showActiveWordUnderline ? "word-active" : undefined}>{ACTIVE}</span>{" "}
					{AFTER}
				</p>
			</div>
		</div>
	);
}
