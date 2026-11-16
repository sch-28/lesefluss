import type React from "react";

/** One header for every onboarding step, so the flow reads as one piece and the heading never moves. */
export const StepHeader: React.FC<{
	title: string;
	description: React.ReactNode;
}> = ({ title, description }) => (
	<header className="flex flex-col items-center text-center">
		<h2 className="m-0 font-semibold text-2xl tracking-tight">{title}</h2>
		<p className="m-0 mt-2 max-w-sm text-muted-foreground leading-relaxed">{description}</p>
	</header>
);
