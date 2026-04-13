/**
 * HighlightsListModal — sheet showing all highlights for the current book.
 *
 * Each row shows a color dot, text snippet, and note preview.
 * Tap a row to jump to that position in the text.
 * Same breakpoint pattern as the TOC modal.
 */

import {
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonItem,
	IonLabel,
	IonList,
	IonModal,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import type React from "react";
import { useMemo } from "react";
import type { Highlight } from "../../services/db/schema";
import { HIGHLIGHT_COLOR_STYLE } from "./selection-toolbar";

const _encoder = new TextEncoder();
const _decoder = new TextDecoder();

interface HighlightsListModalProps {
	isOpen: boolean;
	highlights: Highlight[];
	/** Full book content — used to extract snippet text for each highlight. */
	content: string;
	onClose: () => void;
	onJump: (byteOffset: number) => void;
	theme?: string;
}

/**
 * Extract a readable snippet from pre-encoded book bytes for the given byte range.
 * Truncates to ~60 chars for display.
 */
function extractSnippet(bytes: Uint8Array, startOffset: number, endOffset: number): string {
	// Find the end of the last word — scan forward from endOffset to end of word
	let end = Math.min(endOffset + 30, bytes.length); // allow up to 30 extra bytes for tail of last word
	// Find the first whitespace after endOffset to snap to word boundary
	while (end < bytes.length && bytes[end] !== 32 && bytes[end] !== 10) {
		end++;
	}
	const slice = bytes.slice(startOffset, end);
	const text = _decoder.decode(slice).replace(/\s+/g, " ").trim();
	return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

const HighlightsListModal: React.FC<HighlightsListModalProps> = ({
	isOpen,
	highlights,
	content,
	onClose,
	onJump,
	theme,
}) => {
	// Encode once per content change — not once per highlight per render
	const contentBytes = useMemo(() => _encoder.encode(content), [content]);

	return (
		<IonModal
			isOpen={isOpen}
			onDidDismiss={onClose}
			breakpoints={[0, 0.5, 0.9]}
			initialBreakpoint={0.5}
			className={["rsvp-toc-modal", theme && `reader-theme-${theme}`].filter(Boolean).join(" ")}
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>Highlights</IonTitle>
					<IonButtons slot="end">
						<IonButton onClick={onClose}>Close</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent>
				{highlights.length === 0 ? (
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
										onJump(h.startOffset);
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
				)}
			</IonContent>
		</IonModal>
	);
};

export default HighlightsListModal;
