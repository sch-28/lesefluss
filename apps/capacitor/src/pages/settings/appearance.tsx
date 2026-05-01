import {
	IonBackButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonItem,
	IonLabel,
	IonList,
	IonListHeader,
	IonPage,
	IonTitle,
	IonToggle,
	IonToolbar,
} from "@ionic/react";
import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import type React from "react";
import { useCallback } from "react";
import { PAGINATION_STYLE_OPTIONS } from "../../components/rsvp-pickers";
import { useTheme } from "../../contexts/theme-context";
import { FONT_FAMILIES, THEMES, useAppearanceSettings } from "../../hooks/use-appearance-settings";

const CHIP_CONTAINER_STYLE: React.CSSProperties = { flex: 1, padding: "8px 0" };

const AppearanceSettings: React.FC = () => {
	const { theme, setTheme } = useTheme();
	const {
		fontSize,
		appFontSize,
		fontFamily,
		lineSpacing,
		margin,
		paginationStyle,
		showReadingTime,
		showActiveWordUnderline,
		adjustFontSize,
		adjustAppFontSize,
		adjustLineSpacing,
		adjustMargin,
		setFontFamily,
		setPaginationStyle,
		setShowReadingTime,
		setShowActiveWordUnderline,
	} = useAppearanceSettings();

	const decreaseAppFontSize = useCallback(
		() => adjustAppFontSize(-SETTING_CONSTRAINTS.APP_FONT_SIZE.step),
		[adjustAppFontSize],
	);
	const increaseAppFontSize = useCallback(
		() => adjustAppFontSize(SETTING_CONSTRAINTS.APP_FONT_SIZE.step),
		[adjustAppFontSize],
	);

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/settings" />
					</IonButtons>
					<IonTitle>Appearance</IonTitle>
				</IonToolbar>
			</IonHeader>
			<IonContent>
				<IonList className="content-container">
					{/* ── Theme ── */}
					<IonListHeader>
						<IonLabel>Theme</IonLabel>
					</IonListHeader>
					<IonItem>
						<div className="ap-chips" style={CHIP_CONTAINER_STYLE}>
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
					</IonItem>

					{/* ── Pagination ── */}
					<IonListHeader>
						<IonLabel>Pagination</IonLabel>
					</IonListHeader>
					<IonItem>
						<div className="ap-chips" style={CHIP_CONTAINER_STYLE}>
							{PAGINATION_STYLE_OPTIONS.map((p) => (
								<button
									key={p.value}
									type="button"
									className={paginationStyle === p.value ? "ap-chip ap-chip--active" : "ap-chip"}
									onClick={() => setPaginationStyle(p.value)}
								>
									{p.label}
								</button>
							))}
						</div>
					</IonItem>

					{/* ── Font family ── */}
					<IonListHeader>
						<IonLabel>Font</IonLabel>
					</IonListHeader>
					<IonItem>
						<div className="ap-chips" style={CHIP_CONTAINER_STYLE}>
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
					</IonItem>
					<IonItem>
						<IonLabel>App text size</IonLabel>
						<div slot="end" className="ap-settings-row">
							<span className="ap-settings-val">{appFontSize}px</span>
							<div className="ap-row-buttons">
								<button
									type="button"
									className="ap-step-btn"
									disabled={appFontSize <= SETTING_CONSTRAINTS.APP_FONT_SIZE.min}
									onClick={decreaseAppFontSize}
								>
									A−
								</button>
								<button
									type="button"
									className="ap-step-btn"
									disabled={appFontSize >= SETTING_CONSTRAINTS.APP_FONT_SIZE.max}
									onClick={increaseAppFontSize}
								>
									A+
								</button>
							</div>
						</div>
					</IonItem>

					{/* ── Text size / spacing / margins ── */}
					<IonListHeader>
						<IonLabel>Text</IonLabel>
					</IonListHeader>

					<IonItem>
						<IonLabel>Size</IonLabel>
						<div slot="end" className="ap-settings-row">
							<span className="ap-settings-val">{fontSize}px</span>
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
					</IonItem>

					<IonItem>
						<IonLabel>Line spacing</IonLabel>
						<div slot="end" className="ap-settings-row">
							<span className="ap-settings-val">{lineSpacing.toFixed(1)}</span>
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
					</IonItem>

					<IonItem>
						<IonLabel>Margins</IonLabel>
						<div slot="end" className="ap-settings-row">
							<span className="ap-settings-val">{margin}px</span>
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
					</IonItem>

					<IonItem>
						<IonLabel>Show time remaining</IonLabel>
						<IonToggle
							slot="end"
							checked={showReadingTime}
							onIonChange={(e) => setShowReadingTime(e.detail.checked)}
						/>
					</IonItem>

					<IonItem>
						<IonLabel>Underline active word</IonLabel>
						<IonToggle
							slot="end"
							checked={showActiveWordUnderline}
							onIonChange={(e) => setShowActiveWordUnderline(e.detail.checked)}
						/>
					</IonItem>
				</IonList>
			</IonContent>
		</IonPage>
	);
};

export default AppearanceSettings;
