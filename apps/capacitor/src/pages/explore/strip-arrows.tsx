import { Button } from "@lesefluss/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import type { StripEdges } from "./strip-scroll";

type Props = { label: string; edges: StripEdges; onScroll: (direction: 1 | -1) => void };

/** The pair of arrows that page a strip for a mouse, each disabled at its end. */
export const StripArrows: React.FC<Props> = ({ label, edges, onScroll }) => (
	<div className="flex shrink-0 items-center gap-1">
		<Button
			variant="ghost"
			size="icon-sm"
			onClick={() => onScroll(-1)}
			disabled={edges.atStart}
			aria-label={`Scroll ${label} left`}
		>
			<ChevronLeft />
		</Button>
		<Button
			variant="ghost"
			size="icon-sm"
			onClick={() => onScroll(1)}
			disabled={edges.atEnd}
			aria-label={`Scroll ${label} right`}
		>
			<ChevronRight />
		</Button>
	</div>
);
