import { IonIcon, IonLabel, useIonRouter } from "@ionic/react";
import { chevronBack, chevronForward, library, searchOutline, settings } from "ionicons/icons";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { IS_WEB } from "../utils/platform";

const NAV_ITEMS = [
	{ href: "/tabs/library", icon: library, label: "Library" },
	{ href: "/tabs/explore", icon: searchOutline, label: "Explore" },
	{ href: "/tabs/settings", icon: settings, label: "Settings" },
] as const;

const logoStyle = { width: 28, height: 28, borderRadius: 6 } as const;

const STORAGE_KEY = "sidebar-collapsed";
const READER_PATH_PREFIX = "/tabs/reader/";

const DesktopSidebar: React.FC = () => {
	const location = useLocation();
	const ionRouter = useIonRouter();

	const [isCollapsed, setIsCollapsed] = useState(
		() => localStorage.getItem(STORAGE_KEY) === "true",
	);

	// Persist + drive the body class so CSS can re-flow the router outlet margin.
	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, String(isCollapsed));
		document.body.classList.toggle("sidebar-collapsed", isCollapsed);
		return () => {
			document.body.classList.remove("sidebar-collapsed");
		};
	}, [isCollapsed]);

	// Auto-collapse when entering the reader. We compare against the previous
	// path so this only fires on the transition, not on every re-render while
	// already in the reader - otherwise the user couldn't manually expand
	// without navigating away first.
	const prevPathRef = useRef(location.pathname);
	useEffect(() => {
		const enteringReader =
			location.pathname.startsWith(READER_PATH_PREFIX) &&
			!prevPathRef.current.startsWith(READER_PATH_PREFIX);
		prevPathRef.current = location.pathname;
		if (enteringReader) setIsCollapsed(true);
	}, [location.pathname]);

	const brandInner = (
		<>
			<img src="/logo.png" alt="" style={logoStyle} />
			<span className="desktop-sidebar-brand-text">Lesefluss</span>
		</>
	);

	return (
		<>
			<nav className={isCollapsed ? "desktop-sidebar collapsed" : "desktop-sidebar"}>
				{IS_WEB ? (
					<a href="/" className="desktop-sidebar-brand">
						{brandInner}
					</a>
				) : (
					<div className="desktop-sidebar-brand">{brandInner}</div>
				)}
				{NAV_ITEMS.map((item) => {
					const isActive =
						location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
					return (
						<button
							key={item.href}
							type="button"
							className={isActive ? "desktop-sidebar-item active" : "desktop-sidebar-item"}
							title={isCollapsed ? item.label : undefined}
							aria-label={item.label}
							onClick={() => ionRouter.push(item.href, "root")}
						>
							<IonIcon icon={item.icon} />
							<IonLabel>{item.label}</IonLabel>
						</button>
					);
				})}
			</nav>
			{/* Floating toggle - straddles the sidebar's right edge so it's always
			    visible and discoverable regardless of collapsed state. */}
			<button
				type="button"
				className="desktop-sidebar-toggle"
				title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
				aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
				onClick={() => setIsCollapsed((v) => !v)}
			>
				<IonIcon icon={isCollapsed ? chevronForward : chevronBack} />
			</button>
		</>
	);
};

export default DesktopSidebar;
