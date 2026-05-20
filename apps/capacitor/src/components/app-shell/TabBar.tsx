import { Link } from "@tanstack/react-router";
import { NAV_ITEMS, useActiveNavTo } from "./nav-items";

export function TabBar() {
	const activeTo = useActiveNavTo();
	return (
		<nav className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-card md:hidden">
			<div className="pb-[env(safe-area-inset-bottom)]">
				<ul className="m-0 flex h-[var(--tab-bar-h)] list-none p-0">
					{NAV_ITEMS.map((tab) => (
						<li key={tab.to} className="flex-1">
							<Link
								to={tab.to}
								data-active={activeTo === tab.to}
								className="relative flex h-full flex-col items-center justify-center gap-0.5 text-muted-foreground text-xs no-underline transition-colors hover:text-foreground data-[active=true]:text-primary"
							>
								<tab.icon className="size-5" />
								<span>{tab.label}</span>
							</Link>
						</li>
					))}
				</ul>
			</div>
		</nav>
	);
}
