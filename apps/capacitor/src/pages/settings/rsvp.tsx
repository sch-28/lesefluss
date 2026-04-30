import {
	IonBackButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonPage,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import type React from "react";
import { queryHooks } from "../../services/db/hooks";
import RsvpPreview from "./rsvp-preview";
import RsvpSettingsForm from "./rsvp-settings-form";

const RSVPSettings: React.FC = () => {
	const { data: settings } = queryHooks.useSettings();

	const previewSettings = settings
		? {
				wpm: settings.wpm,
				delayComma: settings.delayComma,
				delayPeriod: settings.delayPeriod,
				accelStart: settings.accelStart,
				accelRate: settings.accelRate,
				xOffset: settings.xOffset,
				focalLetterColor: settings.focalLetterColor,
			}
		: null;

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/settings" />
					</IonButtons>
					<IonTitle>RSVP</IonTitle>
				</IonToolbar>
			</IonHeader>
			<IonContent className="ion-padding">
				<div className="content-container">
					{previewSettings && <RsvpPreview settings={previewSettings} />}
					<RsvpSettingsForm />
				</div>
			</IonContent>
		</IonPage>
	);
};

export default RSVPSettings;
