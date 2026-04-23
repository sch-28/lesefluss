import {
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonInput,
	IonModal,
	IonSpinner,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import type React from "react";
import { useEffect, useState } from "react";
import {
	isLikelyUrl,
	normalizeUrl,
} from "../../services/book-import/utils/url-guards";

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
					label="Article URL"
					labelPlacement="stacked"
					type="url"
					inputmode="url"
					autocapitalize="off"
					autocorrect="off"
					spellcheck={false}
					placeholder="https://example.com/article"
					value={value}
					onIonInput={(e) => setValue(String(e.detail.value ?? ""))}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleSubmit();
					}}
					clearInput
					disabled={isImporting}
				/>
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
