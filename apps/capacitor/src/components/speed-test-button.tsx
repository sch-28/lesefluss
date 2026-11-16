import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { Gauge } from "lucide-react";

/** The one way into the speed test, full width on a phone only. */
export function SpeedTestButton({ className }: { className?: string }) {
	const navigate = useNavigate();
	return (
		<Button
			variant="outline"
			className={cn("w-full md:w-auto", className)}
			onClick={() => void navigate({ to: "/speed-test" })}
			data-testid="speed-test-button"
		>
			<Gauge className="size-4" /> Test my speed
		</Button>
	);
}
