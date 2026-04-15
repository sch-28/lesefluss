import { IonIcon, IonLabel, useIonRouter } from "@ionic/react";
import { library, settings } from "ionicons/icons";
import type React from "react";
import { useLocation } from "react-router-dom";
import { IS_WEB } from "../utils/platform";

const NAV_ITEMS = [
	{ href: "/tabs/library", icon: library, label: "Library" },
	{ href: "/tabs/settings", icon: settings, label: "Settings" },
] as const;

const DesktopSidebar: React.FC = () => {
	const location = useLocation();
	const ionRouter = useIonRouter();

	return (
		<nav className="desktop-sidebar">
			{IS_WEB ? (
				<a href="/" className="desktop-sidebar-brand">RSVP</a>
			) : (
				<div className="desktop-sidebar-brand">RSVP</div>
			)}
			{NAV_ITEMS.map((item) => {
				const isActive =
					location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
				return (
					<button
						key={item.href}
						type="button"
						className={`desktop-sidebar-item${isActive ? " active" : ""}`}
						onClick={() => ionRouter.push(item.href, "root")}
					>
						<IonIcon icon={item.icon} />
						<IonLabel>{item.label}</IonLabel>
					</button>
				);
			})}
		</nav>
	);
};

export default DesktopSidebar;
