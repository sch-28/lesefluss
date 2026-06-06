import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { NAV_ITEMS, useActiveNavTo } from "./nav-items";

const STORAGE_KEY = "sidebar-collapsed";

export function DesktopSidebar() {
	const activeTo = useActiveNavTo();
	const [isCollapsed, setIsCollapsed] = useState(
		() => typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true",
	);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, String(isCollapsed));
		document.body.classList.toggle("sidebar-collapsed", isCollapsed);
		return () => {
			document.body.classList.remove("sidebar-collapsed");
		};
	}, [isCollapsed]);

	return (
		<>
			<nav className="hidden md:fixed md:top-0 md:bottom-0 md:left-0 md:z-40 md:flex md:w-[var(--side-nav-w)] md:flex-col md:overflow-hidden md:border-border md:border-r md:bg-sidebar md:py-6 md:transition-[width] md:duration-200">
				<Link
					to="/tabs/library"
					className="flex items-center justify-start pb-6 text-left text-sidebar-foreground no-underline hover:text-primary"
					aria-label="Lesefluss"
				>
					<span className="flex w-16 shrink-0 items-center justify-center">
						<img
							src={`${import.meta.env.BASE_URL}logo.svg`}
							alt=""
							width={28}
							height={28}
							className="size-7"
						/>
					</span>
					{!isCollapsed && (
						<span className="whitespace-nowrap font-semibold text-base">Lesefluss</span>
					)}
				</Link>
				<ul className="m-0 flex list-none flex-col p-0">
					{NAV_ITEMS.map((item) => {
						const isActive = activeTo === item.to;
						return (
							<li key={item.to}>
								<Link
									to={item.to}
									data-active={isActive}
									title={isCollapsed ? item.label : undefined}
									className="relative flex items-center justify-start py-2.5 text-left text-sidebar-foreground/70 text-sm no-underline transition-colors hover:text-sidebar-foreground data-[active=true]:text-primary data-[active=true]:before:absolute data-[active=true]:before:top-1.5 data-[active=true]:before:bottom-1.5 data-[active=true]:before:left-0 data-[active=true]:before:w-1 data-[active=true]:before:bg-primary"
								>
									<span className="flex w-16 shrink-0 items-center justify-center">
										<item.icon className="size-5" />
									</span>
									{!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
								</Link>
							</li>
						);
					})}
				</ul>
			</nav>
			<button
				type="button"
				onClick={() => setIsCollapsed((v) => !v)}
				aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
				title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
				className="hidden md:fixed md:top-20 md:left-[calc(var(--side-nav-w)-14px)] md:z-50 md:flex md:size-7 md:items-center md:justify-center md:rounded-full md:border md:border-border md:bg-card md:text-muted-foreground md:shadow-sm md:transition-[left] md:duration-200 md:hover:text-foreground"
			>
				{isCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
			</button>
		</>
	);
}
