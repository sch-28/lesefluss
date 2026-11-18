import type React from "react";
import { Section as BaseSection } from "../section-header";

/** A titled card group of rows, the layout every settings and social screen uses. */
export function Section({
	title,
	action,
	children,
}: {
	title?: string;
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<BaseSection title={title} aside={action} headerClassName="px-4">
			<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
				{children}
			</div>
		</BaseSection>
	);
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
	return <p className="px-4 py-4 text-muted-foreground text-sm">{children}</p>;
}
