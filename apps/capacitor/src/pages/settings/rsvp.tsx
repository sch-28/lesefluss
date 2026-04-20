import {
	IonBackButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonItem,
	IonLabel,
	IonList,
	IonListHeader,
	IonNote,
	IonPage,
	IonRange,
	IonSpinner,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import { SETTING_CONSTRAINTS } from "@lesefluss/rsvp-core";
import type React from "react";
import { useAutoSaveSettings } from "../../hooks/use-auto-save-settings";

const RSVPSettings: React.FC = () => {
	const { settings, updateSetting, isPending } = useAutoSaveSettings();

	if (isPending || !settings) {
		return (
			<IonPage>
				<IonContent className="ion-padding ion-text-center">
					<IonSpinner />
				</IonContent>
			</IonPage>
		);
	}

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
				<IonList className="content-container">
					<IonListHeader>
						<IonLabel>Reading Speed</IonLabel>
					</IonListHeader>

					<IonItem>
						<IonLabel position="stacked">Words Per Minute: {settings.wpm}</IonLabel>
						<IonRange
							min={SETTING_CONSTRAINTS.WPM.min}
							max={SETTING_CONSTRAINTS.WPM.max}
							step={SETTING_CONSTRAINTS.WPM.step}
							value={settings.wpm}
							onIonChange={(e) => updateSetting("wpm", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => `${value} WPM`}
						/>
					</IonItem>

					<IonListHeader>
						<IonLabel>Punctuation Delays</IonLabel>
					</IonListHeader>

					<IonItem>
						<IonLabel position="stacked">
							<div className="flex items-center gap-2">
								Comma Delay: {settings.delayComma.toFixed(1)}x<IonNote>(, ; :)</IonNote>
							</div>
						</IonLabel>
						<IonRange
							min={1.0}
							max={5.0}
							step={0.1}
							value={settings.delayComma}
							onIonChange={(e) => updateSetting("delayComma", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => `${value.toFixed(1)}x`}
						/>
					</IonItem>

					<IonItem>
						<IonLabel position="stacked">
							<div className="flex items-center gap-2">
								Period Delay: {settings.delayPeriod.toFixed(1)}x<IonNote>(. ! ?)</IonNote>
							</div>
						</IonLabel>
						<IonRange
							min={1.0}
							max={5.0}
							step={0.1}
							value={settings.delayPeriod}
							onIonChange={(e) => updateSetting("delayPeriod", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => `${value.toFixed(1)}x`}
						/>
					</IonItem>

					<IonListHeader>
						<IonLabel>Acceleration</IonLabel>
					</IonListHeader>

					<IonItem>
						<IonLabel position="stacked">
							<div className="flex items-center gap-2">
								Start Speed: {settings.accelStart.toFixed(1)}x<IonNote>(ease-in)</IonNote>
							</div>
						</IonLabel>
						<IonRange
							min={1.0}
							max={5.0}
							step={0.1}
							value={settings.accelStart}
							onIonChange={(e) => updateSetting("accelStart", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => `${value.toFixed(1)}x`}
						/>
					</IonItem>

					<IonItem>
						<IonLabel position="stacked">
							<div className="flex items-center gap-2">
								Acceleration Rate: {settings.accelRate.toFixed(2)}
								<IonNote>(ramp to full speed)</IonNote>
							</div>
						</IonLabel>
						<IonRange
							min={0.05}
							max={1.0}
							step={0.05}
							value={settings.accelRate}
							onIonChange={(e) => updateSetting("accelRate", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => value.toFixed(2)}
						/>
					</IonItem>

					<IonItem>
						<IonLabel position="stacked">
							<div className="flex items-center gap-2">
								Word Offset: {settings.wordOffset}
								<IonNote>(rewind on resume)</IonNote>
							</div>
						</IonLabel>
						<IonRange
							min={0}
							max={20}
							step={1}
							value={settings.wordOffset}
							onIonChange={(e) => updateSetting("wordOffset", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => `${value} words`}
						/>
					</IonItem>

					<IonListHeader>
						<IonLabel>Display</IonLabel>
					</IonListHeader>

					<IonItem>
						<IonLabel position="stacked">
							<div className="flex items-center gap-2">
								Focal Position: {settings.xOffset}%<IonNote>(horizontal alignment)</IonNote>
							</div>
						</IonLabel>
						<IonRange
							min={SETTING_CONSTRAINTS.X_OFFSET.min}
							max={SETTING_CONSTRAINTS.X_OFFSET.max}
							step={SETTING_CONSTRAINTS.X_OFFSET.step}
							value={settings.xOffset}
							onIonChange={(e) => updateSetting("xOffset", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => `${value}%`}
						/>
					</IonItem>
				</IonList>
			</IonContent>
		</IonPage>
	);
};

export default RSVPSettings;
