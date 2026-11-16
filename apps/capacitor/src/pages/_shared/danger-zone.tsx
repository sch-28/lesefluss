import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@lesefluss/ui/accordion";
import { cn } from "@lesefluss/ui/utils";
import { type LucideIcon, TriangleAlert } from "lucide-react";
import type React from "react";
import { useId } from "react";

const DangerTitle: React.FC<{ title: string }> = ({ title }) => (
	<span className="flex items-center gap-3 font-semibold text-destructive text-sm">
		<TriangleAlert className="size-5 shrink-0" />
		{title}
	</span>
);

/**
 * A page's destructive actions, kept apart from the actions people use day to day. The one
 * Danger zone of the app: every page with destructive actions lists them here as DangerRows.
 * `collapsible` hides the rows behind the title until it is opened.
 */
export const DangerZone: React.FC<{
	children: React.ReactNode;
	title?: string;
	description?: string;
	collapsible?: boolean;
	className?: string;
}> = ({ children, title = "Danger zone", description, collapsible = false, className }) => {
	const titleId = useId();
	const body = (
		<>
			{description && <p className="px-4 pb-3 text-muted-foreground text-xs">{description}</p>}
			<div className="divide-y divide-border border-border border-t">{children}</div>
		</>
	);
	const frame = cn("overflow-hidden rounded-lg border border-border bg-card", className);

	if (collapsible) {
		return (
			<section className={frame}>
				<Accordion type="single" collapsible>
					<AccordionItem value="danger-zone" className="border-b-0">
						<AccordionTrigger className="px-4">
							<DangerTitle title={title} />
						</AccordionTrigger>
						<AccordionContent className="p-0">{body}</AccordionContent>
					</AccordionItem>
				</Accordion>
			</section>
		);
	}

	return (
		<section aria-labelledby={titleId} className={frame}>
			<h2 id={titleId} className="m-0 px-4 pt-3 pb-2">
				<DangerTitle title={title} />
			</h2>
			{body}
		</section>
	);
};

export const DangerRow: React.FC<{
	icon: LucideIcon;
	children: React.ReactNode;
	subtitle?: string;
	onClick: () => void;
	disabled?: boolean;
}> = ({ icon: Icon, children, subtitle, onClick, disabled }) => (
	<button
		type="button"
		onClick={onClick}
		disabled={disabled}
		className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-50"
	>
		<Icon className="size-5 shrink-0 text-destructive" />
		<span className="min-w-0 flex-1">
			<span className="block font-medium text-destructive text-sm">{children}</span>
			{subtitle && <span className="block text-muted-foreground text-xs">{subtitle}</span>}
		</span>
	</button>
);
