import type { ReactNode } from "react";
import { DesktopSidebar } from "./DesktopSidebar";
import { TabBar } from "./TabBar";

export function AppShell({ children }: { children: ReactNode }) {
	return (
		<>
			<DesktopSidebar />
			<TabBar />
			{/* Body is locked (height:100%, overflow:hidden) in variables.css so
			 * document scroll is dead. This div is the app's scroll container:
			 * viewport height, scrolls vertically, padded for the fixed bottom
			 * tab bar + sidebar. */}
			<div className="app-scroll h-screen overflow-y-auto bg-background pb-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom))] text-foreground md:pb-0 md:pl-[var(--side-nav-w)] md:transition-[padding-left] md:duration-200">
				{children}
			</div>
		</>
	);
}
