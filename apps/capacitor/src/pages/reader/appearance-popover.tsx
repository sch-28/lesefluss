import { IonPopover } from "@ionic/react";
import { SETTING_CONSTRAINTS } from "@lesefluss/rsvp-core";
import type React from "react";
import { useTheme } from "../../contexts/theme-context";
import { FONT_FAMILIES, THEMES, useAppearanceSettings } from "../../hooks/use-appearance-settings";

interface Props {
	/** CSS id of the element that triggers/anchors the popover */
	trigger: string;
}

const AppearancePopover: React.FC<Props> = ({ trigger }) => {
	const { theme, setTheme } = useTheme();
	const {
		fontSize,
		fontFamily,
		lineSpacing,
		margin,
		showReadingTime,
		adjustFontSize,
		adjustLineSpacing,
		adjustMargin,
		setFontFamily,
		setShowReadingTime,
	} = useAppearanceSettings();

	return (
		<IonPopover trigger={trigger} className="appearance-popover" side="bottom" alignment="end">
			<div className="appearance-popover-content">
				{/* Theme */}
				<div className="ap-section">
					<span className="ap-label">Theme</span>
					<div className="ap-chips">
						{THEMES.map((t) => (
							<button
								key={t.value}
								type="button"
								className={theme === t.value ? "ap-chip ap-chip--active" : "ap-chip"}
								onClick={() => setTheme(t.value)}
							>
								{t.label}
							</button>
						))}
					</div>
				</div>

				{/* Font family */}
				<div className="ap-section">
					<span className="ap-label">Font</span>
					<div className="ap-chips">
						{FONT_FAMILIES.map((f) => (
							<button
								key={f.value}
								type="button"
								className={fontFamily === f.value ? "ap-chip ap-chip--active" : "ap-chip"}
								style={f.style}
								onClick={() => setFontFamily(f.value)}
							>
								{f.label}
							</button>
						))}
					</div>
				</div>

				{/* Numeric controls */}
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
						<button
							type="button"
							className={showReadingTime ? "ap-chip ap-chip--active" : "ap-chip"}
							onClick={() => setShowReadingTime(!showReadingTime)}
						>
							{showReadingTime ? "On" : "Off"}
						</button>
					</div>
				</div>
			</div>
		</IonPopover>
	);
};

export default AppearancePopover;
