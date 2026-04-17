import type * as React from "react";

export function LegalPage({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle: string;
	children: React.ReactNode;
}) {
	return (
		<div className="mx-auto max-w-3xl px-6 py-16">
			<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
				Legal
			</p>
			<h1 className="mb-4 font-bold text-4xl leading-tight">{title}</h1>
			<p className="mb-12 text-muted-foreground">{subtitle}</p>
			<div className="space-y-10 text-muted-foreground leading-relaxed">{children}</div>
		</div>
	);
}
