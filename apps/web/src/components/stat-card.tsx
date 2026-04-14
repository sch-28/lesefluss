import { Card, CardContent } from "~/components/ui/card";

interface StatCardProps {
	label: string;
	value: string;
}

export function StatCard({ label, value }: StatCardProps) {
	return (
		<Card className="gap-0 bg-card/60 py-0">
			<CardContent className="p-5">
				<p className="mb-1 text-muted-foreground text-xs">{label}</p>
				<p className="font-semibold">{value}</p>
			</CardContent>
		</Card>
	);
}
