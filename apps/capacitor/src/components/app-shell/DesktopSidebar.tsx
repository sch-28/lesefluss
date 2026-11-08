import { Link } from "@tanstack/react-router";
import {
	ChevronLeft,
	ChevronRight,
	Command as CommandIcon,
	Keyboard,
	type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { paletteOpen, shortcutSheetOpen } from "../../commands/global";
import { formatKey, withKey } from "../../commands/keys";
import { useCommandKey } from "../../commands/registry";
import { NavBadge } from "./nav-badge";
import { useActiveNavTo, useNavBadges, useNavItems } from "./nav-items";
import { SidebarCollections } from "./sidebar-collections";
import { SidebarGoalCard } from "./sidebar-goal-card";
import { SidebarSeries } from "./sidebar-series";
import { SidebarSmartShelves } from "./sidebar-smart-shelves";

const STORAGE_KEY = "sidebar-collapsed";

export function DesktopSidebar() {
	const activeTo = useActiveNavTo();
	const badges = useNavBadges();
	const items = useNavItems();
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
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
				<ul className="m-0 flex list-none flex-col p-0">
					{items.map((item) => {
						const isActive = activeTo === item.to;
						return (
							<li key={item.to}>
								<Link
									to={item.to}
									data-active={isActive}
									title={isCollapsed ? item.label : undefined}
									className="relative flex items-center justify-start py-2.5 text-left text-sidebar-foreground/70 text-sm no-underline transition-colors hover:text-sidebar-foreground data-[active=true]:text-primary data-[active=true]:before:absolute data-[active=true]:before:top-1.5 data-[active=true]:before:bottom-1.5 data-[active=true]:before:left-0 data-[active=true]:before:w-1 data-[active=true]:before:bg-primary"
								>
									<span className="relative flex w-16 shrink-0 items-center justify-center">
										<span className="relative">
											<item.icon className="size-5" />
											<NavBadge value={badges[item.to]} />
										</span>
									</span>
									{!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
								</Link>
							</li>
						);
					})}
				</ul>
				<SidebarSmartShelves isCollapsed={isCollapsed} onExpand={() => setIsCollapsed(false)} />
				<SidebarCollections isCollapsed={isCollapsed} onExpand={() => setIsCollapsed(false)} />
				<SidebarSeries isCollapsed={isCollapsed} />
			</div>
			<SidebarGoalCard isCollapsed={isCollapsed} />
			<div className="flex flex-col pt-2" data-testid="sidebar-tools">
				<SidebarTool
					icon={CommandIcon}
					label="Command palette"
					commandId="global.palette"
					isCollapsed={isCollapsed}
					onClick={() => paletteOpen.set(true)}
				/>
				<SidebarTool
					icon={Keyboard}
					label="Keyboard shortcuts"
					commandId="global.shortcuts"
					isCollapsed={isCollapsed}
					onClick={() => shortcutSheetOpen.set(true)}
				/>
				<SidebarTool
					icon={isCollapsed ? ChevronRight : ChevronLeft}
					label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
					isCollapsed={isCollapsed}
					onClick={() => setIsCollapsed((v) => !v)}
				/>
			</div>
		</nav>
	);
}

function SidebarTool({
	icon: Icon,
	label,
	commandId,
	isCollapsed,
	onClick,
}: {
	icon: LucideIcon;
	label: string;
	commandId?: string;
	isCollapsed: boolean;
	onClick: () => void;
}) {
	const shortcut = useCommandKey(commandId ?? "");
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={withKey(label, shortcut)}
			className="flex items-center py-2 text-left text-sidebar-foreground/70 text-sm transition-colors hover:text-sidebar-foreground"
		>
			<span className="flex w-16 shrink-0 items-center justify-center">
				<Icon className="size-4" />
			</span>
			{!isCollapsed && (
				<>
					<span className="flex-1 whitespace-nowrap">{label}</span>
					{shortcut && (
						<kbd className="mr-4 font-sans text-sidebar-foreground/60 text-xs">
							{formatKey(shortcut).join(" ")}
						</kbd>
					)}
				</>
			)}
		</button>
	);
}
