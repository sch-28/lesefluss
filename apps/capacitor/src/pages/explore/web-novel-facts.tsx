import type React from "react";
import type { SeriesDetails } from "../../services/serial-scrapers";

const fmt = (n: number) => n.toLocaleString("en");

/** Badge facts for a web-novel preview; whatever the provider didn't say is left out. */
export function webNovelFacts(details: SeriesDetails | undefined): string[] {
	if (!details) return [];
	return [
		details.status === "completed" ? "Completed" : details.status === "ongoing" ? "Ongoing" : null,
		details.wordCount ? `${fmt(details.wordCount)} words` : null,
		details.rating
			? `★ ${details.rating.toFixed(2)}${details.ratingCount ? ` (${fmt(details.ratingCount)})` : ""}`
			: null,
		details.followers ? `${fmt(details.followers)} followers` : null,
		details.kudos ? `${fmt(details.kudos)} kudos` : null,
		details.lastUpdated ? `Updated ${details.lastUpdated}` : null,
	].filter((fact): fact is string => fact !== null);
}

const ROWS: readonly { key: "rating" | "warnings" | "fandoms" | "relationships"; label: string }[] =
	[
		{ key: "rating", label: "Rating" },
		{ key: "warnings", label: "Archive warnings" },
		{ key: "fandoms", label: "Fandoms" },
		{ key: "relationships", label: "Relationships" },
	];

/** AO3's rating, warnings, fandoms and relationships, the way AO3 readers scan a work. */
export const Ao3Meta: React.FC<{ meta: NonNullable<SeriesDetails["ao3"]> }> = ({ meta }) => {
	const rows = ROWS.filter((r) => meta[r.key].length > 0);
	if (rows.length === 0) return null;
	return (
		<dl
			className="mt-6 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-lg border border-border bg-card p-4 text-sm"
			data-testid="ao3-meta"
		>
			{rows.map((r) => (
				<div key={r.key} className="contents">
					<dt className="text-muted-foreground">{r.label}</dt>
					<dd className="m-0">{meta[r.key].join(", ")}</dd>
				</div>
			))}
		</dl>
	);
};
