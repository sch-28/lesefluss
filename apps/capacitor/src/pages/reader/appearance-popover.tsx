import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@lesefluss/ui/toggle-group";
import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import type React from "react";
import { PAGINATION_STYLE_OPTIONS } from "../../components/rsvp-pickers";
import { useTheme } from "../../contexts/theme-context";
import { FONT_FAMILIES, THEMES, useAppearanceSettings } from "../../hooks/use-appearance-settings";

interface Props {
	trigger: React.ReactNode;
}

const AppearancePopover: React.FC<Props> = ({ trigger }) => {
	const { theme, setTheme } = useTheme();
	const {
		fontSize,
		fontFamily,
		lineSpacing,
		margin,
		paginationStyle,
		showReadingTime,
		showActiveWordUnderline,
		showGlossaryUnderline,
		adjustFontSize,
		adjustLineSpacing,
		adjustMargin,
		setFontFamily,
		setPaginationStyle,
		setShowReadingTime,
		setShowActiveWordUnderline,
		setShowGlossaryUnderline,
	} = useAppearanceSettings();

	return (
		<Popover>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-0">
				<div className="appearance-popover-content">
					<div className="ap-section">
						<span className="ap-label">Theme</span>
						<ToggleGroup
							type="single"
							variant="outline"
							value={theme}
							onValueChange={(v) => v && setTheme(v as typeof theme)}
							className="w-full"
						>
							{THEMES.map((t) => (
								<ToggleGroupItem key={t.value} value={t.value}>
									{t.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					<div className="ap-section">
						<span className="ap-label">Pagination</span>
						<ToggleGroup
							type="single"
							variant="outline"
							value={paginationStyle}
							onValueChange={(v) => v && setPaginationStyle(v as typeof paginationStyle)}
							className="w-full"
						>
							{PAGINATION_STYLE_OPTIONS.map((p) => (
								<ToggleGroupItem key={p.value} value={p.value}>
									{p.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					<div className="ap-section">
						<span className="ap-label">Font</span>
						<ToggleGroup
							type="single"
							variant="outline"
							value={fontFamily}
							onValueChange={(v) => v && setFontFamily(v as typeof fontFamily)}
							className="w-full"
						>
							{FONT_FAMILIES.map((f) => (
								<ToggleGroupItem key={f.value} value={f.value} style={f.style}>
									{f.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					<div className="ap-section ap-section--rows">
						<div className="ap-row">
							<span className="ap-row-label">Size</span>
							<span className="ap-row-value">{fontSize}px</span>
							<div className="ap-row-buttons">
								<button
									type="button"
									className="ap-step-btn"
									disabled={fontSize <= SETTING_CONSTRAINTS.READER_FONT_SIZE.min}
									onClick={() => adjustFontSize(-SETTING_CONSTRAINTS.READER_FONT_SIZE.step)}
								>
									A−
								</button>
								<button
									type="button"
									className="ap-step-btn"
									disabled={fontSize >= SETTING_CONSTRAINTS.READER_FONT_SIZE.max}
									onClick={() => adjustFontSize(SETTING_CONSTRAINTS.READER_FONT_SIZE.step)}
								>
									A+
								</button>
							</div>
						</div>

						<div className="ap-row">
							<span className="ap-row-label">Spacing</span>
							<span className="ap-row-value">{lineSpacing.toFixed(1)}</span>
							<div className="ap-row-buttons">
								<button
									type="button"
									className="ap-step-btn"
									disabled={lineSpacing <= SETTING_CONSTRAINTS.READER_LINE_SPACING.min}
									onClick={() => adjustLineSpacing(-SETTING_CONSTRAINTS.READER_LINE_SPACING.step)}
								>
									−
								</button>
								<button
									type="button"
									className="ap-step-btn"
									disabled={lineSpacing >= SETTING_CONSTRAINTS.READER_LINE_SPACING.max}
									onClick={() => adjustLineSpacing(SETTING_CONSTRAINTS.READER_LINE_SPACING.step)}
								>
									+
								</button>
							</div>
						</div>

						<div className="ap-row">
							<span className="ap-row-label">Margins</span>
							<span className="ap-row-value">{margin}px</span>
							<div className="ap-row-buttons">
								<button
									type="button"
									className="ap-step-btn"
									disabled={margin <= SETTING_CONSTRAINTS.READER_MARGIN.min}
									onClick={() => adjustMargin(-SETTING_CONSTRAINTS.READER_MARGIN.step)}
								>
									−
								</button>
								<button
									type="button"
									className="ap-step-btn"
									disabled={margin >= SETTING_CONSTRAINTS.READER_MARGIN.max}
									onClick={() => adjustMargin(SETTING_CONSTRAINTS.READER_MARGIN.step)}
								>
									+
								</button>
							</div>
						</div>

						<div className="ap-row">
							<span className="ap-row-label">Time remaining</span>
							<ToggleGroup
								type="single"
								variant="outline"
								value={showReadingTime ? "on" : "off"}
								onValueChange={(v) => v && setShowReadingTime(v === "on")}
							>
								<ToggleGroupItem value="off">Off</ToggleGroupItem>
								<ToggleGroupItem value="on">On</ToggleGroupItem>
							</ToggleGroup>
						</div>
						<div className="ap-row">
							<span className="ap-row-label">Underline word</span>
							<ToggleGroup
								type="single"
								variant="outline"
								value={showActiveWordUnderline ? "on" : "off"}
								onValueChange={(v) => v && setShowActiveWordUnderline(v === "on")}
							>
								<ToggleGroupItem value="off">Off</ToggleGroupItem>
								<ToggleGroupItem value="on">On</ToggleGroupItem>
							</ToggleGroup>
						</div>
						<div className="ap-row">
							<span className="ap-row-label">Glossary highlights</span>
							<ToggleGroup
								type="single"
								variant="outline"
								value={showGlossaryUnderline ? "on" : "off"}
								onValueChange={(v) => v && setShowGlossaryUnderline(v === "on")}
							>
								<ToggleGroupItem value="off">Off</ToggleGroupItem>
								<ToggleGroupItem value="on">On</ToggleGroupItem>
							</ToggleGroup>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
};

export default AppearancePopover;
