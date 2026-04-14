/**
 * SearchModal — bottom sheet for searching book text.
 *
 * - Case-insensitive scan over the full content string
 * - Results show a ~60-char snippet around each match (match bolded)
 *   plus a right-aligned % position indicator
 * - Capped at MAX_RESULTS to avoid overwhelming the list
 * - Tap a result → jumps to that byte offset and closes the sheet
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
import { useCallback, useMemo, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchModalProps {
	isOpen: boolean;
	onClose: () => void;
	content: string;
	onJump: (byteOffset: number) => void;
	theme?: string;
	initialQuery?: string;
}

interface SearchResult {
	/** JS char offset of the match start in content */
	offset: number;
	/** 0–100 percentage position in the book */
	pct: number;
	/** Parts of the snippet: alternating normal/highlighted text */
	parts: { text: string; highlight: boolean }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RESULTS = 100;
const SNIPPET_BEFORE = 40; // chars before match
const SNIPPET_AFTER = 60; // chars after match end

// ─── Search logic ─────────────────────────────────────────────────────────────

/**
 * Scan `content` case-insensitively for `query`.
 * Returns up to MAX_RESULTS matches with JS char offsets + snippets.
 * The parent converts char offsets to UTF-8 byte offsets via utf8ByteLength.
 */
function buildResults(content: string, query: string): SearchResult[] {
	if (!query) return [];
	const lower = content.toLowerCase();
	const lowerQuery = query.toLowerCase();
	const qLen = query.length;
	const contentLen = content.length;
	const results: SearchResult[] = [];

	let pos = 0;
	while (pos < contentLen && results.length < MAX_RESULTS) {
		const idx = lower.indexOf(lowerQuery, pos);
		if (idx === -1) break;

		const snippetStart = Math.max(0, idx - SNIPPET_BEFORE);
		const snippetEnd = Math.min(contentLen, idx + qLen + SNIPPET_AFTER);
		const before = (snippetStart > 0 ? "…" : "") + content.slice(snippetStart, idx);
		const match = content.slice(idx, idx + qLen);
		const after = content.slice(idx + qLen, snippetEnd) + (snippetEnd < contentLen ? "…" : "");

		results.push({
			offset: idx,
			pct: Math.round((idx / contentLen) * 100),
			parts: [
				{ text: before, highlight: false },
				{ text: match, highlight: true },
				{ text: after, highlight: false },
			],
		});

		pos = idx + qLen;
	}

	return results;
}

// ─── Component ────────────────────────────────────────────────────────────────

const SearchModal: React.FC<SearchModalProps> = ({
	isOpen,
	onClose,
	content,
	onJump,
	theme,
	initialQuery,
}) => {
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	// Seed query from initialQuery when the modal opens with one
	const lastInitialRef = useRef<string | undefined>(undefined);
	if (isOpen && initialQuery && initialQuery !== lastInitialRef.current) {
		lastInitialRef.current = initialQuery;
		setQuery(initialQuery);
	}
	if (!isOpen) {
		lastInitialRef.current = undefined;
	}

	const handleDidDismiss = useCallback(() => {
		setQuery("");
		onClose();
	}, [onClose]);

	const handleDidPresent = useCallback(() => {
		inputRef.current?.focus();
	}, []);

	const results = useMemo(() => buildResults(content, query.trim()), [content, query]);

	const handleResultTap = useCallback(
		(charOffset: number) => {
			onJump(charOffset);
			onClose();
		},
		[onJump, onClose],
	);

	const resultCount = results.length;
	const isCapped = resultCount === MAX_RESULTS;

	return (
		<IonModal
			isOpen={isOpen}
			onDidPresent={handleDidPresent}
			onDidDismiss={handleDidDismiss}
			breakpoints={[0, 0.45, 1]}
			initialBreakpoint={0.45}
			className={["rsvp-search-modal", theme && `reader-theme-${theme}`].filter(Boolean).join(" ")}
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>Search</IonTitle>
					<IonButtons slot="end">
						<IonButton onClick={onClose}>Close</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<IonContent>
				{/* ── Search input ── */}
				<div className="search-input-wrap">
					<input
						ref={inputRef}
						className="search-input"
						type="search"
						placeholder="Search in book…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						autoComplete="off"
						autoCorrect="off"
						autoCapitalize="off"
						spellCheck={false}
					/>
				</div>

				{/* ── Result count ── */}
				{query.trim() && (
					<p className="search-result-count">
						{resultCount === 0
							? "No results"
							: isCapped
								? `${MAX_RESULTS}+ results`
								: `${resultCount} result${resultCount === 1 ? "" : "s"}`}
					</p>
				)}

				{/* ── Results list ── */}
				{results.length > 0 && (
					<IonList lines="full" className="search-results-list">
						{results.map((r) => (
							<IonItem
								key={r.offset}
								button
								detail={false}
								onClick={() => handleResultTap(r.offset)}
							>
								<IonLabel className="search-result-label">
									<p className="search-snippet">
										{r.parts.map((p, i) =>
											p.highlight ? (
												// biome-ignore lint/suspicious/noArrayIndexKey: fixed 3-element [before, match, after]
												<strong key={i} className="search-match">
													{p.text}
												</strong>
											) : (
												// biome-ignore lint/suspicious/noArrayIndexKey: fixed 3-element [before, match, after]
												<span key={i}>{p.text}</span>
											),
										)}
									</p>
								</IonLabel>
								<span slot="end" className="search-pct">
									{r.pct}%
								</span>
							</IonItem>
						))}
					</IonList>
				)}

				{/* ── Empty state ── */}
				{!query.trim() && <p className="search-empty">Type to search through the book text.</p>}
			</IonContent>
		</IonModal>
	);
};

export default SearchModal;
