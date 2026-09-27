import type { NavBadge as NavBadgeValue } from "./nav-items";

export function NavBadge({ value }: { value: NavBadgeValue }) {
	if (value === undefined || value === 0) return null;
	if (value === "dot") {
		return (
			<span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" aria-hidden />
		);
	}
	return (
		<span className="absolute top-0 right-0 flex h-4 min-w-4 translate-x-1/2 -translate-y-1/3 items-center justify-center rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground">
			{value > 99 ? "99+" : value}
		</span>
	);
}
