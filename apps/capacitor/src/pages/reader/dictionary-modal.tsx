/**
 * DictionaryModal: bottom drawer showing the definition of a word.
 *
 * Fetches from our own catalog dictionary, built from Wiktionary data. Results
 * are cached by react-query so the same word won't re-fetch.
 */

import { Browser } from "@capacitor/browser";
import type { DictionaryEntry, DictionarySense } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Loader2, Search } from "lucide-react";
import type React from "react";
import { lookupWord } from "../../services/dictionary/client";
import { dictionaryKeys } from "../../services/dictionary/query-keys";

export interface DictionaryModalProps {
	/** Original casing, as the word appears in the book. */
	word: string | null;
	/** The book's language, unvalidated; the server normalises it. */
	lang?: string | null;
	onClose: () => void;
	onSearch?: (word: string) => void;
	onAddToGlossary?: (word: string) => void;
	theme?: string;
}

const MAX_DEFINITIONS = 3;

/**
 * One heading per part of speech, in first-seen order.
 *
 * Not consecutive-only: the server orders by rank then by entry, so a word with
 * two noun entries either side of a verb would otherwise render "NOUN" twice.
 */
function groupByPartOfSpeech(
	senses: DictionarySense[],
): { pos: string; senses: DictionarySense[] }[] {
	const groups = new Map<string, DictionarySense[]>();
	for (const sense of senses) {
		const existing = groups.get(sense.partOfSpeech);
		if (existing) existing.push(sense);
		else groups.set(sense.partOfSpeech, [sense]);
	}
	return [...groups].map(([pos, list]) => ({ pos, senses: list }));
}

const DictionaryModal: React.FC<DictionaryModalProps> = ({
	word,
	lang,
	onClose,
	onSearch,
	onAddToGlossary,
	theme,
}) => {
	const { data, isPending, isError } = useQuery({
		queryKey: dictionaryKeys.lookup(word ?? "", lang ?? null),
		queryFn: ({ signal }) => lookupWord({ word: word as string, lang, signal }),
		enabled: word !== null,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const entry: DictionaryEntry | null = data?.entry ?? null;
	const isOpen = word !== null;

	// A definition from a language other than the book's is worth surfacing: a
	// silent English answer inside a German book is the failure this is meant
	// to avoid.
	const fallbackLang =
		entry && data?.requested && entry.lang !== data.requested ? entry.lang : null;

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent className={theme ? `reader-theme-${theme}` : undefined}>
				<DrawerHeader className="flex flex-row items-center justify-between gap-2">
					<DrawerTitle className="flex min-w-0 flex-1 items-center gap-2">
						<span className="truncate">{word ?? ""}</span>
						{fallbackLang && (
							// Says which dictionary answered when it isn't the book's own
							// language — the one state that stops a wrong-language
							// definition from looking authoritative.
							<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium text-[10px] text-foreground uppercase">
								<span aria-hidden="true">{fallbackLang}</span>
								<span className="sr-only">Definition from the {fallbackLang} dictionary</span>
							</span>
						)}
					</DrawerTitle>
					<div className="flex items-center gap-1">
						{onSearch && word && (
							<Button
								variant="ghost"
								size="icon"
								onClick={() => onSearch(word)}
								aria-label="Search in book"
							>
								<Search />
							</Button>
						)}
						{onAddToGlossary && word && (
							<Button
								variant="ghost"
								size="icon"
								onClick={() => onAddToGlossary(word)}
								aria-label="Add to glossary"
							>
								<Bookmark />
							</Button>
						)}
					</div>
				</DrawerHeader>

				<div className="flex flex-col overflow-y-auto px-5 pb-6">
					{isPending && (
						<div className="flex justify-center py-8">
							<Loader2 className="size-5 animate-spin text-muted-foreground" />
						</div>
					)}

					{isError && (
						<p className="text-center text-muted-foreground text-sm">
							Could not load definition. Check your connection.
						</p>
					)}

					{!isPending && !isError && !entry && (
						<p className="text-center text-muted-foreground text-sm">
							No definition found for &ldquo;{word}&rdquo;.
						</p>
					)}

					{entry && (
						<div className="flex flex-col gap-4">
							{data?.lemma && (
								<p className="m-0 text-muted-foreground text-sm">
									{data.lemma.from} &rarr; <span className="text-foreground">{entry.word}</span>
									{data.lemma.note && <span className="block text-xs">{data.lemma.note}</span>}
								</p>
							)}

							{groupByPartOfSpeech(entry.senses ?? []).map((group, groupIndex) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: entries share a part of speech and glosses repeat, so no content key is unique; the list is immutable per query result
								<div key={`${groupIndex}-${group.pos}`} className="flex flex-col gap-2">
									<p className="m-0 font-semibold text-foreground text-xs uppercase tracking-wide">
										{group.pos}
									</p>
									<ol className="m-0 flex flex-col gap-2 pl-5 text-sm">
										{group.senses.slice(0, MAX_DEFINITIONS).map((sense, senseIndex) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: see above
											<li key={`${groupIndex}-${senseIndex}`}>
												<span className="text-foreground">{sense.gloss}</span>
												{sense.example && (
													<span className="text-muted-foreground italic">
														{" "}
														&ldquo;{sense.example}&rdquo;
													</span>
												)}
											</li>
										))}
									</ol>
								</div>
							))}

							{/* Required by CC BY-SA, which the dictionary data is licensed under. */}
							{data?.attribution?.url && (
								<button
									type="button"
									className="m-0 cursor-pointer border-0 bg-transparent p-0 text-left text-[11px] text-muted-foreground"
									onClick={() => void Browser.open({ url: data.attribution.url })}
								>
									{data.attribution.source} &middot; {data.attribution.license}
								</button>
							)}
						</div>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	);
};

export default DictionaryModal;
