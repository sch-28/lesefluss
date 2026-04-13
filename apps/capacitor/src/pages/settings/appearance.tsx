import {
	IonBackButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonIcon,
	IonItem,
	IonLabel,
	IonList,
	IonPage,
	IonTitle,
	IonToggle,
	IonToolbar,
} from "@ionic/react";
import { moonOutline, sunnyOutline } from "ionicons/icons";
import type React from "react";
import { useTheme } from "../../contexts/theme-context";

const AppearanceSettings: React.FC = () => {
	const { theme, toggleTheme } = useTheme();

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/settings" />
					</IonButtons>
					<IonTitle>Appearance</IonTitle>
				</IonToolbar>
			</IonHeader>
			<IonContent className="ion-padding">
				<IonList>
					<IonItem>
						<IonIcon slot="start" icon={theme === "dark" ? moonOutline : sunnyOutline} />
						<IonLabel>Dark Mode</IonLabel>
						<IonToggle checked={theme === "dark"} onIonChange={toggleTheme} />
					</IonItem>
				</IonList>
			</IonContent>
		</IonPage>
	);
};

export default AppearanceSettings;
