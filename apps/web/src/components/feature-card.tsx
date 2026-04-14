import { Card, CardContent } from "~/components/ui/card";

interface FeatureCardProps {
	icon: string;
	title: string;
	description: string;
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
	return (
		<Card className="gap-0 py-0">
			<CardContent className="p-6">
				<div className="mb-3 text-2xl">{icon}</div>
				<h3 className="mb-2 font-semibold">{title}</h3>
				<p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
			</CardContent>
		</Card>
	);
}
