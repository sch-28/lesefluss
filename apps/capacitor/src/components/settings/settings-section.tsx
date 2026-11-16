import type React from "react";
import { SectionHeader } from "../section-header";

export function SettingsSection({
	title,
	hint,
	action,
	children,
}: {
	title?: string;
	hint?: string;
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		// Spacing lives on the section, not its header, so untitled groups keep the same rhythm.
		<section className="pt-6 first:pt-0">
			{(title || action) && (
				<SectionHeader title={title} subtitle={hint} aside={action} className="mb-2 px-4" />
			)}
			<div className="flex flex-col divide-y divide-border">{children}</div>
		</section>
	);
}
