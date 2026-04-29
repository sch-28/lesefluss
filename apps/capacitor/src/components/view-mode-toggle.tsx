import { IonButton, IonIcon } from "@ionic/react";
import { gridOutline, listOutline } from "ionicons/icons";
import type React from "react";

export type ViewMode = "grid" | "list";

export const ViewModeToggle: React.FC<{ viewMode: ViewMode; onToggle: () => void }> = ({
	viewMode,
	onToggle,
}) => (
	<IonButton
		onClick={onToggle}
		aria-label={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
	>
		<IonIcon slot="icon-only" icon={viewMode === "grid" ? listOutline : gridOutline} />
	</IonButton>
);
