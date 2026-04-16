import type { LucideIcon } from "lucide-react";

interface FeatureCardProps {
	icon: LucideIcon;
	title: string;
	description: string;
}

export function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
	return (
		<div className="flex gap-3">
			<Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
			<div>
				<h3 className="mb-1 font-semibold">{title}</h3>
				<p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
			</div>
		</div>
	);
}
