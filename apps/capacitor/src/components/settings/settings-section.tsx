import type React from "react";
import { Section } from "../section-header";

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
		<Section title={title} subtitle={hint} aside={action} headerClassName="px-4">
			<div className="flex flex-col divide-y divide-border">{children}</div>
		</Section>
	);
}
