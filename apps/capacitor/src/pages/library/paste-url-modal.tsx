import {
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonInput,
	IonModal,
	IonNote,
	IonSpinner,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import type React from "react";
import { useEffect, useState } from "react";
import { isLikelyUrl, normalizeUrl } from "../../services/book-import/utils/url-guards";

interface PasteUrlModalProps {
	isOpen: boolean;
	isImporting: boolean;
	onClose: () => void;
	onSubmit: (url: string) => void;
}

const PasteUrlModal: React.FC<PasteUrlModalProps> = ({
	isOpen,
	isImporting,
	onClose,
	onSubmit,
}) => {
	const [value, setValue] = useState("");

	// Clear the field whenever the modal (re)opens.
	useEffect(() => {
		if (isOpen) setValue("");
	}, [isOpen]);

	const canSubmit = !isImporting && isLikelyUrl(normalizeUrl(value));

	const handleSubmit = () => {
		if (!canSubmit) return;
		onSubmit(normalizeUrl(value));
	};

	return (
		<IonModal isOpen={isOpen} onDidDismiss={onClose}>
			<IonHeader className="ion-no-border">
				<IonToolbar>
					<IonTitle>Import from URL</IonTitle>
					<IonButtons slot="end">
						<IonButton onClick={onClose} disabled={isImporting}>
							Cancel
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent className="ion-padding">
				<IonInput
					label="Article or web novel URL"
					labelPlacement="stacked"
					type="url"
					inputmode="url"
					autocapitalize="off"
					autocorrect="off"
					spellcheck={false}
					placeholder="https://www.royalroad.com/fiction/..."
					value={value}
					onIonInput={(e) => setValue(String(e.detail.value ?? ""))}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleSubmit();
					}}
					clearInput
					disabled={isImporting}
				/>
				<IonNote className="ion-margin-top block">
					Paste an article link or a supported web novel URL from Royal Road, ScribbleHub, Archive
					of Our Own, or Wuxiaworld.
				</IonNote>
				<IonButton
					expand="block"
					className="ion-margin-top"
					disabled={!canSubmit}
					onClick={handleSubmit}
				>
					{isImporting ? <IonSpinner name="crescent" /> : "Import"}
				</IonButton>
			</IonContent>
		</IonModal>
	);
};

export default PasteUrlModal;
