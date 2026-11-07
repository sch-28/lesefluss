export function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-border px-2 py-2">
			<dt className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</dt>
			<dd className="mt-0.5 font-semibold text-lg tabular-nums">{value}</dd>
		</div>
	);
}
