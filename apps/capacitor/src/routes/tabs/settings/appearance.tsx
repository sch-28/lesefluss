import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { Switch } from "@lesefluss/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@lesefluss/ui/toggle-group";
import { Eye } from "lucide-react";
import { useCallback } from "react";
import { PAGINATION_STYLE_OPTIONS } from "@/components/rsvp-pickers";
import { PageHeader } from "@/components/app-shell/page-header";
import { useTheme } from "@/contexts/theme-context";
import { FONT_FAMILIES, THEMES, useAppearanceSettings } from "@/hooks/use-appearance-settings";

export const Route = createFileRoute("/tabs/settings/appearance")({
	component: AppearanceSettings,
});

function StepperRow({
	label,
	value,
	canDec,
	canInc,
	onDec,
	onInc,
	decLabel = "−",
	incLabel = "+",
}: {
	label: string;
	value: string;
	canDec: boolean;
	canInc: boolean;
	onDec: () => void;
	onInc: () => void;
	decLabel?: string;
	incLabel?: string;
}) {
	return (
		<div className="flex items-center justify-between px-4 py-3">
			<div className="font-medium text-foreground text-sm">{label}</div>
			<div className="flex items-center gap-3">
				<span className="font-mono text-muted-foreground text-sm tabular-nums">{value}</span>
				<div className="flex gap-1.5">
					<button
						type="button"
						className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
						disabled={!canDec}
						onClick={onDec}
					>
						{decLabel}
					</button>
					<button
						type="button"
						className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
						disabled={!canInc}
						onClick={onInc}
					>
						{incLabel}
					</button>
				</div>
			</div>
		</div>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="mt-6 first:mt-2">
			<h2 className="px-4 pb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
				{title}
			</h2>
			<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
				{children}
			</div>
		</section>
	);
}

function AppearanceSettings() {
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
		<div className="bg-background">
			<PageHeader title="Appearance" icon={Eye} />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				<Section title="Theme">
					<div className="p-3">
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
				</Section>

				<Section title="Pagination">
					<div className="p-3">
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
				</Section>

				<Section title="Font">
					<div className="p-3">
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
					<StepperRow
						label="App text size"
						value={`${appFontSize}px`}
						canDec={appFontSize > SETTING_CONSTRAINTS.APP_FONT_SIZE.min}
						canInc={appFontSize < SETTING_CONSTRAINTS.APP_FONT_SIZE.max}
						onDec={decreaseAppFontSize}
						onInc={increaseAppFontSize}
						decLabel="A−"
						incLabel="A+"
					/>
				</Section>

				<Section title="Text">
					<StepperRow
						label="Size"
						value={`${fontSize}px`}
						canDec={fontSize > SETTING_CONSTRAINTS.READER_FONT_SIZE.min}
						canInc={fontSize < SETTING_CONSTRAINTS.READER_FONT_SIZE.max}
						onDec={() => adjustFontSize(-SETTING_CONSTRAINTS.READER_FONT_SIZE.step)}
						onInc={() => adjustFontSize(SETTING_CONSTRAINTS.READER_FONT_SIZE.step)}
						decLabel="A−"
						incLabel="A+"
					/>
					<StepperRow
						label="Line spacing"
						value={lineSpacing.toFixed(1)}
						canDec={lineSpacing > SETTING_CONSTRAINTS.READER_LINE_SPACING.min}
						canInc={lineSpacing < SETTING_CONSTRAINTS.READER_LINE_SPACING.max}
						onDec={() => adjustLineSpacing(-SETTING_CONSTRAINTS.READER_LINE_SPACING.step)}
						onInc={() => adjustLineSpacing(SETTING_CONSTRAINTS.READER_LINE_SPACING.step)}
					/>
					<StepperRow
						label="Margins"
						value={`${margin}px`}
						canDec={margin > SETTING_CONSTRAINTS.READER_MARGIN.min}
						canInc={margin < SETTING_CONSTRAINTS.READER_MARGIN.max}
						onDec={() => adjustMargin(-SETTING_CONSTRAINTS.READER_MARGIN.step)}
						onInc={() => adjustMargin(SETTING_CONSTRAINTS.READER_MARGIN.step)}
					/>
					<div className="flex items-center justify-between px-4 py-3">
						<label htmlFor="show-reading-time" className="font-medium text-foreground text-sm">
							Show time remaining
						</label>
						<Switch
							id="show-reading-time"
							checked={showReadingTime}
							onCheckedChange={setShowReadingTime}
						/>
					</div>
					<div className="flex items-center justify-between px-4 py-3">
						<label htmlFor="show-active-word" className="font-medium text-foreground text-sm">
							Underline active word
						</label>
						<Switch
							id="show-active-word"
							checked={showActiveWordUnderline}
							onCheckedChange={setShowActiveWordUnderline}
						/>
					</div>
				</Section>
			</div>
		</div>
	);
}
