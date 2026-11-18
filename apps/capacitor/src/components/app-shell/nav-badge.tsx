import { CountBadge } from "@lesefluss/ui/count-badge";
import type { NavBadge as NavBadgeValue } from "./nav-items";

export function NavBadge({ value }: { value: NavBadgeValue }) {
	if (value === undefined || value === 0) return null;
	if (value === "dot") {
		return (
			<span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" aria-hidden />
		);
	}
	return (
		<CountBadge count={value} className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/3" />
	);
}
