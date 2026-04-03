/**
 * DictionaryModal — bottom sheet showing the definition of a word.
 *
 * Fetches from the Free Dictionary API (no key needed).
 * Results are cached by react-query so the same word won't re-fetch.
 */

import {
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonModal,
	IonSpinner,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import type React from "react";

// ─── API types ───────────────────────────────────────────────────────────────

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

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchDefinition(word: string): Promise<DictEntry[]> {
	const res = await fetch(
		`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
	);
	if (res.status === 404) return [];
	if (!res.ok) throw new Error(`Dictionary API error: ${res.status}`);
	return res.json() as Promise<DictEntry[]>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface DictionaryModalProps {
	word: string | null;
	onClose: () => void;
	theme?: string;
}

const MAX_DEFINITIONS = 3;

const DictionaryModal: React.FC<DictionaryModalProps> = ({ word, onClose, theme }) => {
	const { data, isPending, isError } = useQuery({
		queryKey: ["dictionary", word],
		queryFn: () => fetchDefinition(word!),
		enabled: word !== null,
		staleTime: Number.POSITIVE_INFINITY, // definitions don't change
	});

	const entry = data?.[0];

	return (
		<IonModal
			isOpen={word !== null}
			onDidDismiss={onClose}
			breakpoints={[0, 0.5, 1]}
			initialBreakpoint={0.5}
			className={["rsvp-dictionary-modal", theme && `reader-theme-${theme}`]
				.filter(Boolean)
				.join(" ")}
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle style={{ textTransform: "none" }}>{word ?? ""}</IonTitle>
					<IonButtons slot="end">
						<IonButton onClick={onClose}>Close</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<IonContent className="ion-padding">
				{isPending && (
					<div className="dict-center">
						<IonSpinner />
					</div>
				)}

				{isError && (
					<p className="dict-not-found">Could not load definition. Check your connection.</p>
				)}

				{!isPending && !isError && !entry && (
					<p className="dict-not-found">No definition found for &ldquo;{word}&rdquo;.</p>
				)}

				{entry && (
					<div className="dict-entry">
						{entry.phonetic && <p className="dict-phonetic">{entry.phonetic}</p>}

						{entry.meanings.map((meaning, mi) => (
							<div key={mi} className="dict-meaning">
								<p className="dict-pos">{meaning.partOfSpeech}</p>
								<ol className="dict-definitions">
									{meaning.definitions.slice(0, MAX_DEFINITIONS).map((def, di) => (
										<li key={di}>
											<span className="dict-definition">{def.definition}</span>
											{def.example && (
												<span className="dict-example"> &ldquo;{def.example}&rdquo;</span>
											)}
										</li>
									))}
								</ol>
							</div>
						))}
					</div>
				)}
			</IonContent>
		</IonModal>
	);
};

export default DictionaryModal;
