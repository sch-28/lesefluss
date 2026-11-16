import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import type { LucideIcon } from "lucide-react";
import type React from "react";
import { useId } from "react";

/** A page's destructive actions, kept apart from the actions people use day to day. */
export const DangerZone: React.FC<{
	children: React.ReactNode;
	title?: string;
	className?: string;
}> = ({ children, title = "Danger zone", className }) => {
	const titleId = useId();
	return (
		<section aria-labelledby={titleId} className={cn("book-detail-card", className)}>
			<h2 id={titleId} className="book-detail-section-title">
				{title}
			</h2>
			<div className="flex flex-col gap-2">{children}</div>
		</section>
	);
};

export const DangerButton: React.FC<{
	icon: LucideIcon;
	children: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
}> = ({ icon: Icon, children, onClick, disabled }) => (
	<Button
		variant="outline"
		size="lg"
		className="justify-start gap-3 text-destructive hover:text-destructive"
		onClick={onClick}
		disabled={disabled}
	>
		<Icon />
		{children}
	</Button>
);
