/**
 * SearchModal: bottom drawer for searching book text.
 *
 * Case-insensitive scan over the full content string. Results show a ~60-char
 * snippet around each match (match bolded) plus a right-aligned % position
 * indicator. Capped at MAX_RESULTS to avoid overwhelming the list.
 * Tap a result jumps to that byte offset and closes the drawer.
 */

import { Button } from "@lesefluss/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import { Input } from "@lesefluss/ui/input";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
	/** 0 to 100 percentage position in the book */
	pct: number;
	parts: { text: string; highlight: boolean }[];
}

const MAX_RESULTS = 100;
const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 60;

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

	const lastInitialRef = useRef<string | undefined>(undefined);
	if (isOpen && initialQuery && initialQuery !== lastInitialRef.current) {
		lastInitialRef.current = initialQuery;
		setQuery(initialQuery);
	}
	if (!isOpen) {
		lastInitialRef.current = undefined;
	}

	useEffect(() => {
		if (isOpen) {
			// Delay so the drawer mount animation doesn't steal focus.
			const t = setTimeout(() => inputRef.current?.focus(), 100);
			return () => clearTimeout(t);
		}
	}, [isOpen]);

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
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) {
					setQuery("");
					onClose();
				}
			}}
		>
			<DrawerContent className={theme ? `reader-theme-${theme}` : undefined}>
				<DrawerHeader className="flex flex-row items-center justify-between gap-2">
					<DrawerTitle className="flex-1">Search</DrawerTitle>
					<Button variant="ghost" size="sm" onClick={onClose}>
						Close
					</Button>
				</DrawerHeader>

				<div className="flex flex-col overflow-hidden">
					<div className="px-5 pb-3">
						<Input
							ref={inputRef}
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

					{query.trim() && (
						<p className="m-0 px-5 pb-2 text-muted-foreground text-xs">
							{resultCount === 0
								? "No results"
								: isCapped
									? `${MAX_RESULTS}+ results`
									: `${resultCount} result${resultCount === 1 ? "" : "s"}`}
						</p>
					)}

					{results.length > 0 && (
						<ul className="m-0 flex flex-col overflow-y-auto pb-6">
							{results.map((r) => (
								<li key={r.offset}>
									<button
										type="button"
										onClick={() => handleResultTap(r.offset)}
										className="flex w-full items-center gap-3 border-border border-t px-5 py-3 text-left transition-colors hover:bg-muted"
									>
										<p className="m-0 flex-1 text-foreground text-sm leading-snug">
											{r.parts.map((p, i) =>
												p.highlight ? (
													// biome-ignore lint/suspicious/noArrayIndexKey: fixed 3-element [before, match, after]
													<strong key={i} className="bg-yellow-200/60 px-0.5 dark:bg-yellow-500/30">
														{p.text}
													</strong>
												) : (
													// biome-ignore lint/suspicious/noArrayIndexKey: fixed 3-element [before, match, after]
													<span key={i}>{p.text}</span>
												),
											)}
										</p>
										<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
											{r.pct}%
										</span>
									</button>
								</li>
							))}
						</ul>
					)}

					{!query.trim() && (
						<p className="m-0 px-5 py-8 text-center text-muted-foreground text-sm">
							Type to search through the book text.
						</p>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	);
};

export default SearchModal;
