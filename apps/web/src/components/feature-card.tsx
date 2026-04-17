import type { LucideIcon } from "lucide-react";

interface FeatureCardProps {
	icon: LucideIcon;
	title: string;
	description: string;
}

export function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
	return (
		<div className="rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:shadow-md">
			<h3 className="mb-2 flex items-center gap-2 font-semibold">
				<Icon className="h-4 w-4 shrink-0 text-primary" />
				{title}
			</h3>
			<p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
		</div>
	);
}
