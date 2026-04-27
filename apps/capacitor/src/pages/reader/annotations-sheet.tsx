/**
 * AnnotationsSheet — single bottom sheet that merges three reader navigations:
 * Contents (chapter list), Highlights, and Glossary.
 *
 * Empty segments hide automatically, so a TXT book without chapters opens
 * straight on Highlights or Glossary.
 */

import {
	IonContent,
	IonFab,
	IonFabButton,
	IonHeader,
	IonIcon,
	IonItem,
	IonItemDivider,
	IonLabel,
	IonList,
	IonModal,
	IonSegment,
	IonSegmentButton,
	IonToolbar,
} from "@ionic/react";
import { addOutline } from "ionicons/icons";
import type React from "react";
import { memo, useEffect, useMemo, useState } from "react";
import type { Chapter, GlossaryEntry, Highlight } from "../../services/db/schema";
import GlossaryAvatar, { colorFromLabel } from "./glossary-avatar";
import { HIGHLIGHT_COLOR_STYLE } from "./selection-toolbar";

type Tab = "contents" | "highlights" | "glossary";

const _encoder = new TextEncoder();
const _decoder = new TextDecoder();

function extractSnippet(bytes: Uint8Array, startOffset: number, endOffset: number): string {
	let end = Math.min(endOffset + 30, bytes.length);
	while (end < bytes.length && bytes[end] !== 32 && bytes[end] !== 10) {
		end++;
	}
	const slice = bytes.slice(startOffset, end);
	const text = _decoder.decode(slice).replace(/\s+/g, " ").trim();
	return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

interface AnnotationsSheetProps {
	isOpen: boolean;
	onClose: () => void;
	theme?: string;

	/** Chapters — empty array hides the Contents tab. */
	chapters: Chapter[];
	onJumpChapter: (startByte: number) => void;

	highlights: Highlight[];
	/** Full book content for snippet extraction. */
	content: string;
	onJumpHighlight: (byteOffset: number) => void;

	glossary: GlossaryEntry[];
	currentBookId: string;
	onOpenEntry: (entry: GlossaryEntry) => void;
	onAddEntry: () => void;
}

const AnnotationsSheet: React.FC<AnnotationsSheetProps> = ({
	isOpen,
	onClose,
	theme,
	chapters,
	onJumpChapter,
	highlights,
	content,
	onJumpHighlight,
	glossary,
	currentBookId,
	onOpenEntry,
	onAddEntry,
}) => {
	const hasContents = chapters.length > 0;
	const hasHighlights = highlights.length > 0;
	// Glossary tab is always available so users can add their first entry from here.

	// Pick a sensible initial tab based on what's non-empty.
	const initialTab: Tab = hasContents ? "contents" : hasHighlights ? "highlights" : "glossary";
	const [tab, setTab] = useState<Tab>(initialTab);

	// Reset to a sensible tab whenever the sheet opens. Intentionally NOT
	// reactive to data changes mid-open — a user adding a highlight from another
	// path shouldn't yank them off the Glossary tab.
	// biome-ignore lint/correctness/useExhaustiveDependencies: only react to isOpen
	useEffect(() => {
		if (isOpen) setTab(initialTab);
	}, [isOpen]);

	const contentBytes = useMemo(() => _encoder.encode(content), [content]);

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
		<IonModal
			isOpen={isOpen}
			onDidDismiss={onClose}
			breakpoints={[0, 0.5, 0.9]}
			initialBreakpoint={0.5}
			className={["rsvp-annotations-modal", theme && `reader-theme-${theme}`]
				.filter(Boolean)
				.join(" ")}
		>
			<IonHeader className="ion-no-border">
				<IonToolbar>
					<IonSegment value={tab} onIonChange={(e) => setTab(e.detail.value as Tab)}>
						{hasContents && (
							<IonSegmentButton value="contents">
								<IonLabel>Contents</IonLabel>
							</IonSegmentButton>
						)}
						<IonSegmentButton value="highlights">
							<IonLabel>Highlights</IonLabel>
						</IonSegmentButton>
						<IonSegmentButton value="glossary">
							<IonLabel>Glossary</IonLabel>
						</IonSegmentButton>
					</IonSegment>
				</IonToolbar>
			</IonHeader>

			<IonContent>
				{tab === "contents" && (
					<IonList>
						{chapters.map((ch, i) => (
							<IonItem
								key={i.toString()}
								button
								detail={false}
								onClick={() => {
									onJumpChapter(ch.startByte);
									onClose();
								}}
							>
								<IonLabel>{ch.title}</IonLabel>
							</IonItem>
						))}
					</IonList>
				)}

				{tab === "highlights" &&
					(highlights.length === 0 ? (
						<p className="highlights-list-empty">No highlights yet.</p>
					) : (
						<IonList>
							{highlights.map((h) => {
								const snippet = extractSnippet(contentBytes, h.startOffset, h.endOffset);
								return (
									<IonItem
										key={h.id}
										button
										detail={false}
										onClick={() => {
											onJumpHighlight(h.startOffset);
											onClose();
										}}
									>
										<span
											className="highlight-list-dot"
											style={{
												background:
													HIGHLIGHT_COLOR_STYLE[h.color as keyof typeof HIGHLIGHT_COLOR_STYLE] ??
													HIGHLIGHT_COLOR_STYLE.yellow,
											}}
											slot="start"
										/>
										<IonLabel>
											<p className="highlight-list-snippet">"{snippet}"</p>
											{h.note && <p className="highlight-list-note">{h.note}</p>}
										</IonLabel>
									</IonItem>
								);
							})}
						</IonList>
					))}

				{tab === "glossary" && (
					<>
						{bookEntries.length === 0 && globalEntries.length === 0 ? (
							<p className="highlights-list-empty">No entries yet. Tap + to add one.</p>
						) : (
							<IonList>
								{bookEntries.length > 0 && (
									<>
										<IonItemDivider sticky>
											<IonLabel>This book</IonLabel>
										</IonItemDivider>
										{bookEntries.map((e) => (
											<GlossaryRow key={e.id} entry={e} onOpen={onOpenEntry} />
										))}
									</>
								)}
								{globalEntries.length > 0 && (
									<>
										<IonItemDivider sticky>
											<IonLabel>Global</IonLabel>
										</IonItemDivider>
										{globalEntries.map((e) => (
											<GlossaryRow key={e.id} entry={e} onOpen={onOpenEntry} />
										))}
									</>
								)}
							</IonList>
						)}
						<IonFab
							slot="fixed"
							vertical="bottom"
							horizontal="end"
							style={{ marginBottom: "env(safe-area-inset-bottom)" }}
						>
							<IonFabButton size="small" onClick={onAddEntry} aria-label="Add glossary entry">
								<IonIcon icon={addOutline} />
							</IonFabButton>
						</IonFab>
					</>
				)}
			</IonContent>
		</IonModal>
	);
};

interface GlossaryRowProps {
	entry: GlossaryEntry;
	onOpen: (entry: GlossaryEntry) => void;
}

const GlossaryRow: React.FC<GlossaryRowProps> = memo(({ entry, onOpen }) => {
	const color = entry.color || colorFromLabel(entry.label);
	return (
		<IonItem button detail={false} onClick={() => onOpen(entry)}>
			<GlossaryAvatar label={entry.label} color={color} size={32} />
			<IonLabel>
				<h3 className="glossary-list-label">{entry.label}</h3>
				{entry.notes && <p className="glossary-list-notes">{entry.notes}</p>}
			</IonLabel>
		</IonItem>
	);
});

export default AnnotationsSheet;
