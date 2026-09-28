import type React from "react";

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
		<section className="mt-6 first:mt-2">
			{(title || action) && (
				<div className="flex items-center justify-between px-4 pb-2">
					{title && (
						<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
							{title}
						</h2>
					)}
					{action}
				</div>
			)}
			<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
				{children}
			</div>
		</section>
	);
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
	return <p className="px-4 py-4 text-muted-foreground text-sm">{children}</p>;
}
