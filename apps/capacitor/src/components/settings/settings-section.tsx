import type React from "react";

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
		<section>
			{(title || action) && (
				<div className="flex items-baseline justify-between gap-2 px-4 pt-5 pb-2">
					<div className="flex min-w-0 items-baseline gap-2">
						{title && (
							<h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
								{title}
							</h3>
						)}
						{hint && <span className="text-muted-foreground text-xs">{hint}</span>}
					</div>
					{action}
				</div>
			)}
			<div className="flex flex-col divide-y divide-border">{children}</div>
		</section>
	);
}
