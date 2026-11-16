import { cn } from "@lesefluss/ui/utils";

/** The one section header on the Stats tabs: a title and an optional muted aside. */
export function SectionHeader({
	title,
	aside,
	className,
}: {
	title: string;
	aside?: React.ReactNode;
	className?: string;
}) {
	return (
		<header className={cn("mb-3 flex items-baseline justify-between gap-3", className)}>
			<h2 className="m-0 font-semibold text-[1.0625rem]">{title}</h2>
			{aside != null && (
				<span className="shrink-0 text-[0.8125rem] text-muted-foreground tabular-nums">
					{aside}
				</span>
			)}
		</header>
	);
}

/** A Stats section: page gutter and the one vertical rhythm between sections. */
export function StatsSection({
	title,
	aside,
	children,
	className,
	"data-testid": testId,
}: {
	title?: string;
	aside?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
	"data-testid"?: string;
}) {
	return (
		<section className={cn("mt-6 px-4", className)} data-testid={testId}>
			{title && <SectionHeader title={title} aside={aside} />}
			{children}
		</section>
	);
}

/** A bordered card holding a list of rows, as the Stats and Speed tabs show them. */
export function StatCard({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"rounded-[14px] border border-border bg-card px-4 text-card-foreground [&>*:last-child]:border-b-0",
				className,
			)}
		>
			{children}
		</div>
	);
}

/** One 56px list row: a label (and sub line) on the left, a value (and detail) on the right. */
export function StatRow({
	icon,
	label,
	sub,
	value,
	detail,
	action,
	"data-testid": testId,
}: {
	icon?: React.ReactNode;
	label: React.ReactNode;
	sub?: React.ReactNode;
	value?: React.ReactNode;
	detail?: React.ReactNode;
	action?: React.ReactNode;
	"data-testid"?: string;
}) {
	return (
		<div
			className="flex min-h-14 items-center gap-3 border-border border-b py-2"
			data-testid={testId}
		>
			{icon}
			<div className="min-w-0 flex-1">
				<div className="text-sm">{label}</div>
				{sub != null && <div className="text-[0.8125rem] text-muted-foreground">{sub}</div>}
			</div>
			{value != null && (
				<div className="min-w-0 max-w-[55%] text-right">
					<div className="font-semibold text-sm tabular-nums">{value}</div>
					{detail != null && (
						<div className="truncate text-[0.8125rem] text-muted-foreground">{detail}</div>
					)}
				</div>
			)}
			{action}
		</div>
	);
}

/** A list row is at least 56px; cards reserve that per row while loading. */
export const STAT_ROW_HEIGHT = 56;
