import { cn } from "@lesefluss/ui/utils";
import { CARD_SURFACE } from "@/components/card";
import { LIST_ROW, LIST_ROW_LABEL, LIST_ROW_SUB, LIST_ROW_VALUE } from "@/components/list-row";
import { SECTION_SPACING, Section, SectionHeader } from "../../../components/section-header";

export { SECTION_SPACING, SectionHeader };

/** A Stats section: the shared section inside the page gutter. */
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
		<Section title={title} aside={aside} className={cn("px-4", className)} data-testid={testId}>
			{children}
		</Section>
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
		<div className={cn(CARD_SURFACE, "px-4 [&>*:last-child]:border-b-0", className)}>
			{children}
		</div>
	);
}

/** One list row: a label (and sub line) on the left, a value (and detail) on the right. */
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
		<div className={cn(LIST_ROW, "border-border border-b px-0")} data-testid={testId}>
			{icon}
			<div className="min-w-0 flex-1">
				<div className={LIST_ROW_LABEL}>{label}</div>
				{sub != null && <div className={LIST_ROW_SUB}>{sub}</div>}
			</div>
			{value != null && (
				<div className="min-w-0 max-w-[55%] text-right">
					<div className={cn("font-semibold", LIST_ROW_VALUE)}>{value}</div>
					{detail != null && <div className={cn("truncate", LIST_ROW_SUB)}>{detail}</div>}
				</div>
			)}
			{action}
		</div>
	);
}

/** A row with a sub line and its border: 16 padding, a 20 and a 16 line, 1 border. Cards reserve that per row while loading. */
export const STAT_ROW_HEIGHT = 53;
