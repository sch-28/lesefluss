import { cn } from "@lesefluss/ui/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { NavBadge } from "./nav-badge";
import { useNavBadges, useNavItems } from "./nav-items";
import { tabBarHidden } from "./tab-bar-visibility";

export function TabBar() {
	const { pathname } = useLocation();
	const badges = useNavBadges();
	const items = useNavItems();
	if (tabBarHidden.useValue()) return null;
	return (
		<nav
			data-toast-clear
			data-slot="tab-bar"
			className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-card md:hidden"
		>
			{/* Narrower than about five labels (large system text): only the active tab
			    keeps its label on screen, as Material's selected-label mode does. */}
			<div className="@container pb-[var(--safe-bottom)]">
				<ul className="m-0 flex h-[var(--tab-bar-h)] list-none p-0">
					{items.map((tab) => {
						const isActive = pathname === tab.to || pathname.startsWith(`${tab.to}/`);
						return (
							<li
								key={tab.to}
								className={cn("min-w-0 flex-1", isActive && "@max-[20em]:flex-[1.75]")}
							>
								<Link
									to={tab.to}
									style={isActive ? { color: "var(--primary)" } : undefined}
									data-active={isActive ? "true" : undefined}
									className="relative flex h-full flex-col items-center justify-center gap-1 text-muted-foreground text-xs no-underline transition-colors hover:text-foreground"
								>
									<span className="relative">
										<tab.icon className="size-5" />
										<NavBadge value={badges[tab.to]} />
									</span>
									<span
										className={cn(
											"w-full truncate px-0.5 text-center",
											!isActive && "@max-[20em]:sr-only",
										)}
									>
										{tab.label}
									</span>
								</Link>
							</li>
						);
					})}
				</ul>
			</div>
		</nav>
	);
}
