import { STAT_CAPTION } from "@/components/stat-tile";

export function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-border px-2 py-2">
			<dt className={STAT_CAPTION}>{label}</dt>
			<dd className="mt-1 font-semibold text-lg tabular-nums">{value}</dd>
		</div>
	);
}
