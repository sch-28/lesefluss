import {
	IonBackButton,
	IonButton,
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
import { SETTING_CONSTRAINTS } from "@rsvp/rsvp-core";
import type React from "react";
import { useSettingsDraft } from "../../hooks/use-settings-draft";

const RSVPSettings: React.FC = () => {
	const { draft, updateSetting, handleSave, isPending } = useSettingsDraft();

	if (isPending || !draft) {
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
				<IonList>
					<IonListHeader>
						<IonLabel>Reading Speed</IonLabel>
					</IonListHeader>

					<IonItem>
						<IonLabel position="stacked">Words Per Minute: {draft.wpm}</IonLabel>
						<IonRange
							min={SETTING_CONSTRAINTS.WPM.min}
							max={SETTING_CONSTRAINTS.WPM.max}
							step={SETTING_CONSTRAINTS.WPM.step}
							value={draft.wpm}
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
								Comma Delay: {draft.delayComma.toFixed(1)}x<IonNote>(, ; :)</IonNote>
							</div>
						</IonLabel>
						<IonRange
							min={1.0}
							max={5.0}
							step={0.1}
							value={draft.delayComma}
							onIonChange={(e) => updateSetting("delayComma", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => `${value.toFixed(1)}x`}
						/>
					</IonItem>

					<IonItem>
						<IonLabel position="stacked">
							<div className="flex items-center gap-2">
								Period Delay: {draft.delayPeriod.toFixed(1)}x<IonNote>(. ! ?)</IonNote>
							</div>
						</IonLabel>
						<IonRange
							min={1.0}
							max={5.0}
							step={0.1}
							value={draft.delayPeriod}
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
								Start Speed: {draft.accelStart.toFixed(1)}x<IonNote>(ease-in)</IonNote>
							</div>
						</IonLabel>
						<IonRange
							min={1.0}
							max={5.0}
							step={0.1}
							value={draft.accelStart}
							onIonChange={(e) => updateSetting("accelStart", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => `${value.toFixed(1)}x`}
						/>
					</IonItem>

					<IonItem>
						<IonLabel position="stacked">
							<div className="flex items-center gap-2">
								Acceleration Rate: {draft.accelRate.toFixed(2)}
								<IonNote>(ramp to full speed)</IonNote>
							</div>
						</IonLabel>
						<IonRange
							min={0.05}
							max={1.0}
							step={0.05}
							value={draft.accelRate}
							onIonChange={(e) => updateSetting("accelRate", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => value.toFixed(2)}
						/>
					</IonItem>

					<IonItem>
						<IonLabel position="stacked">
							<div className="flex items-center gap-2">
								Word Offset: {draft.wordOffset}
								<IonNote>(rewind on resume)</IonNote>
							</div>
						</IonLabel>
						<IonRange
							min={0}
							max={20}
							step={1}
							value={draft.wordOffset}
							onIonChange={(e) => updateSetting("wordOffset", e.detail.value as number)}
							pin
							pinFormatter={(value: number) => `${value} words`}
						/>
					</IonItem>
				</IonList>

				<div className="ion-padding">
					<IonButton expand="block" onClick={handleSave}>
						Save Settings
					</IonButton>
				</div>
			</IonContent>
		</IonPage>
	);
};

export default RSVPSettings;
