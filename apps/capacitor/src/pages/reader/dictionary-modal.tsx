/**
 * DictionaryModal: bottom drawer showing the definition of a word.
 *
 * Fetches from the Free Dictionary API (no key needed).
 * Results are cached by react-query so the same word won't re-fetch.
 */

import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Loader2, Search } from "lucide-react";
import type React from "react";

interface DictDefinition {
	definition: string;
	example?: string;
}

interface DictMeaning {
	partOfSpeech: string;
	definitions: DictDefinition[];
}

interface DictEntry {
	word: string;
	phonetic?: string;
	meanings: DictMeaning[];
}

async function fetchDefinition(word: string): Promise<DictEntry[]> {
	const res = await fetch(
		`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
	);
	if (res.status === 404) return [];
	if (!res.ok) throw new Error(`Dictionary API error: ${res.status}`);
	return res.json() as Promise<DictEntry[]>;
}

export interface DictionaryModalProps {
	word: string | null;
	onClose: () => void;
	onSearch?: (word: string) => void;
	onAddToGlossary?: (word: string) => void;
	theme?: string;
}

const MAX_DEFINITIONS = 3;

const DictionaryModal: React.FC<DictionaryModalProps> = ({
	word,
	onClose,
	onSearch,
	onAddToGlossary,
	theme,
}) => {
	const { data, isPending, isError } = useQuery({
		queryKey: ["dictionary", word],
		queryFn: () => fetchDefinition(word as string),
		enabled: word !== null,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const entry = data?.[0];
	const isOpen = word !== null;

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent className={theme ? `reader-theme-${theme}` : undefined}>
				<DrawerHeader className="flex flex-row items-center justify-between gap-2">
					<DrawerTitle className="flex-1 truncate">{word ?? ""}</DrawerTitle>
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
						<Button variant="ghost" size="sm" onClick={onClose}>
							Close
						</Button>
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
							{entry.phonetic && (
								<p className="m-0 text-muted-foreground text-sm">{entry.phonetic}</p>
							)}

							{entry.meanings.map((meaning) => (
								<div key={meaning.partOfSpeech} className="flex flex-col gap-2">
									<p className="m-0 font-semibold text-foreground text-xs uppercase tracking-wide">
										{meaning.partOfSpeech}
									</p>
									<ol className="m-0 flex flex-col gap-2 pl-5 text-sm">
										{meaning.definitions.slice(0, MAX_DEFINITIONS).map((def) => (
											<li key={def.definition}>
												<span className="text-foreground">{def.definition}</span>
												{def.example && (
													<span className="text-muted-foreground italic">
														{" "}
														&ldquo;{def.example}&rdquo;
													</span>
												)}
											</li>
										))}
									</ol>
								</div>
							))}
						</div>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	);
};

export default DictionaryModal;
