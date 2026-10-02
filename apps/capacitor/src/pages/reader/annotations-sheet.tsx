/**
 * AnnotationsSheet: single bottom drawer that merges three reader navigations:
 * Contents (chapter list), Highlights, and Glossary. Empty segments hide
 * automatically, so a TXT book without chapters opens straight on Highlights
 * or Glossary.
 *
 * Snap points keep the iOS-like half-then-full sheet behavior.
 */

import { Drawer, DrawerContent, DrawerHeader, drawerSnapPoints } from "@lesefluss/ui/drawer";
import { ToggleGroup, ToggleGroupItem } from "@lesefluss/ui/toggle-group";
import { cn } from "@lesefluss/ui/utils";
import { Plus } from "lucide-react";
import type React from "react";
import { memo, useCallback, useMemo, useState } from "react";
import type { Chapter, GlossaryEntry, Highlight } from "../../services/db/schema";
import { SeriesChapterList } from "../library/series-chapter-list";
import ContentsList from "./contents-list";
import GlossaryAvatar, { colorFromLabel } from "./glossary-avatar";
import { HIGHLIGHT_COLOR_STYLE } from "./selection-toolbar";

type Tab = "contents" | "chapters" | "highlights" | "glossary";

function snippetFromText(text: string | null): string {
	if (!text) return "(no preview)";
	const cleaned = text.replace(/\s+/g, " ").trim();
	return cleaned.length > 60 ? `${cleaned.slice(0, 60)}…` : cleaned;
}

interface AnnotationsSheetProps {
	isOpen: boolean;
	onClose: () => void;
	theme?: string;
	chapters: Chapter[];
	currentChapterIndex: number;
	onJumpChapter: (startWord: number) => void;
	seriesId?: string | null;
	highlights: Highlight[];
	onJumpHighlight: (highlight: Highlight) => void;
	glossary: GlossaryEntry[];
	currentBookId: string;
	onOpenEntry: (entry: GlossaryEntry) => void;
	onAddEntry: () => void;
}

const SNAP_POINTS = drawerSnapPoints([0.5, 1]);

const AnnotationsSheet: React.FC<AnnotationsSheetProps> = ({
	isOpen,
	onClose,
	theme,
	chapters,
	currentChapterIndex,
	onJumpChapter,
	seriesId,
	highlights,
	onJumpHighlight,
	glossary,
	currentBookId,
	onOpenEntry,
	onAddEntry,
}) => {
	const hasContents = chapters.length > 0;
	const hasChapters = seriesId != null;
	const hasHighlights = highlights.length > 0;

	// Chapters wins over Contents when both apply (web-novel imports have both;
	// the series chapter list is the more useful primary view for serial readers).
	const initialTab: Tab = hasChapters
		? "chapters"
		: hasContents
			? "contents"
			: hasHighlights
				? "highlights"
				: "glossary";
	const [tab, setTab] = useState<Tab>(initialTab);
	const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);

	// Reset tab and snap when the sheet opens. Adjusted during render rather
	// than in an effect so a child's mount-time request (ContentsList expanding
	// the sheet) isn't overridden by a later passive effect. Intentionally not
	// reactive to data changes mid-open: a user adding a highlight from another
	// path shouldn't yank them off the Glossary tab.
	const [wasOpen, setWasOpen] = useState(isOpen);
	if (isOpen !== wasOpen) {
		setWasOpen(isOpen);
		if (isOpen) {
			setTab(initialTab);
			setSnap(SNAP_POINTS[0]);
		}
	}

	const expandSheet = useCallback(() => setSnap(SNAP_POINTS[1]), []);

	const { bookEntries, globalEntries } = useMemo(() => {
		const book: GlossaryEntry[] = [];
		const global: GlossaryEntry[] = [];
		for (const e of glossary) {
			if (e.bookId === null) global.push(e);
			else if (e.bookId === currentBookId) book.push(e);
		}
		return { bookEntries: book, globalEntries: global };
	}, [glossary, currentBookId]);

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			snapPoints={SNAP_POINTS}
			activeSnapPoint={snap}
			setActiveSnapPoint={setSnap}
		>
			<DrawerContent className={cn("h-full", theme ? `reader-theme-${theme}` : undefined)}>
				<DrawerHeader className="px-3">
					<ToggleGroup
						type="single"
						variant="outline"
						value={tab}
						onValueChange={(v) => {
							if (v) setTab(v as Tab);
						}}
						className="w-full"
					>
						{hasContents && <ToggleGroupItem value="contents">Contents</ToggleGroupItem>}
						{hasChapters && <ToggleGroupItem value="chapters">Chapters</ToggleGroupItem>}
						<ToggleGroupItem value="highlights">Highlights</ToggleGroupItem>
						<ToggleGroupItem value="glossary">Glossary</ToggleGroupItem>
					</ToggleGroup>
				</DrawerHeader>

				{/* Keyed so each tab starts at its own scroll position, not the last tab's. */}
				<div key={tab} className="relative flex-1 overflow-y-auto">
					{tab === "contents" && (
						<ContentsList
							chapters={chapters}
							currentIndex={currentChapterIndex}
							onJump={(startWord) => {
								onJumpChapter(startWord);
								onClose();
							}}
							obscuredHeight={window.innerHeight * (1 - SNAP_POINTS[0])}
							onNeedsFullHeight={expandSheet}
						/>
					)}

					{tab === "chapters" && seriesId && (
						<SeriesChapterList seriesId={seriesId} currentBookId={currentBookId} />
					)}

					{tab === "highlights" &&
						(highlights.length === 0 ? (
							<p className="m-0 px-5 py-8 text-center text-muted-foreground text-sm">
								No highlights yet.
							</p>
						) : (
							<ul className="flex flex-col">
								{highlights.map((h) => {
									const snippet = snippetFromText(h.text);
									return (
										<li key={h.id}>
											<button
												type="button"
												onClick={() => {
													onJumpHighlight(h);
													onClose();
												}}
												className="flex w-full items-start gap-3 border-border border-b px-5 py-3 text-left transition-colors hover:bg-muted"
											>
												<span
													aria-hidden
													className="mt-1.5 size-3 shrink-0 rounded-full"
													style={{
														background:
															HIGHLIGHT_COLOR_STYLE[
																h.color as keyof typeof HIGHLIGHT_COLOR_STYLE
															] ?? HIGHLIGHT_COLOR_STYLE.yellow,
													}}
												/>
												<div className="min-w-0 flex-1">
													<p className="m-0 text-foreground text-sm leading-snug">"{snippet}"</p>
													{h.note && (
														<p className="m-0 mt-1 text-muted-foreground text-xs italic">
															{h.note}
														</p>
													)}
												</div>
											</button>
										</li>
									);
								})}
							</ul>
						))}

					{tab === "glossary" && (
						<>
							{bookEntries.length === 0 && globalEntries.length === 0 ? (
								<p className="m-0 px-5 py-8 text-center text-muted-foreground text-sm">
									No entries yet. Tap + to add one.
								</p>
							) : (
								<div className="flex flex-col">
									{bookEntries.length > 0 && (
										<>
											<div className="sticky top-0 z-10 border-border border-b bg-popover px-5 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
												This book
											</div>
											{bookEntries.map((e) => (
												<GlossaryRow key={e.id} entry={e} onOpen={onOpenEntry} />
											))}
										</>
									)}
									{globalEntries.length > 0 && (
										<>
											<div className="sticky top-0 z-10 border-border border-b bg-popover px-5 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
												Global
											</div>
											{globalEntries.map((e) => (
												<GlossaryRow key={e.id} entry={e} onOpen={onOpenEntry} />
											))}
										</>
									)}
								</div>
							)}
							<button
								type="button"
								onClick={onAddEntry}
								aria-label="Add glossary entry"
								className="fixed right-4 bottom-4 inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
								style={{ marginBottom: "var(--safe-bottom)" }}
							>
								<Plus className="size-5" />
							</button>
						</>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	);
};

interface GlossaryRowProps {
	entry: GlossaryEntry;
	onOpen: (entry: GlossaryEntry) => void;
}

const GlossaryRow: React.FC<GlossaryRowProps> = memo(({ entry, onOpen }) => {
	const color = entry.color || colorFromLabel(entry.label);
	return (
		<button
			type="button"
			onClick={() => onOpen(entry)}
			className="flex w-full items-center gap-3 border-border border-b px-5 py-3 text-left transition-colors hover:bg-muted"
		>
			<GlossaryAvatar label={entry.label} color={color} size={32} />
			<div className="min-w-0 flex-1">
				<h3 className="m-0 font-semibold text-foreground text-sm">{entry.label}</h3>
				{entry.notes && (
					<p className="m-0 mt-0.5 truncate text-muted-foreground text-xs">{entry.notes}</p>
				)}
			</div>
		</button>
	);
});

export default AnnotationsSheet;
