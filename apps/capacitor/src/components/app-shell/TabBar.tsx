import { Link, useLocation } from "@tanstack/react-router";
import { NavBadge } from "./nav-badge";
import { useNavBadges, useNavItems } from "./nav-items";

export function TabBar() {
	const { pathname } = useLocation();
	const badges = useNavBadges();
	const items = useNavItems();
	return (
		<nav className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-card md:hidden">
			<div className="pb-[var(--safe-bottom)]">
				<ul className="m-0 flex h-[var(--tab-bar-h)] list-none p-0">
					{items.map((tab) => {
						const isActive = pathname === tab.to || pathname.startsWith(`${tab.to}/`);
						return (
							<li key={tab.to} className="flex-1">
								<Link
									to={tab.to}
									style={isActive ? { color: "var(--primary)" } : undefined}
									className="relative flex h-full flex-col items-center justify-center gap-0.5 text-muted-foreground text-xs no-underline transition-colors hover:text-foreground"
								>
									<span className="relative">
										<tab.icon className="size-5" />
										<NavBadge value={badges[tab.to]} />
									</span>
									<span>{tab.label}</span>
								</Link>
							</li>
						);
					})}
				</ul>
			</div>
		</nav>
	);
}
