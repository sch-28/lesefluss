import type { LucideIcon } from "lucide-react";
import type React from "react";

/** One header for every onboarding step, so the flow reads as one piece. */
export const StepHeader: React.FC<{
	title: string;
	description: React.ReactNode;
	icon?: LucideIcon;
}> = ({ title, description, icon: Icon }) => (
	<header className="flex flex-col items-center text-center">
		{Icon && (
			<div className="mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
				<Icon className="size-8 text-primary" />
			</div>
		)}
		<h2 className="m-0 font-semibold text-2xl tracking-tight">{title}</h2>
		<p className="m-0 mt-2 max-w-sm text-muted-foreground leading-relaxed">{description}</p>
	</header>
);
