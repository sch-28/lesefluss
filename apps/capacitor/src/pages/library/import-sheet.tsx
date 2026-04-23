import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonModal } from "@ionic/react";
import { clipboardOutline, documentOutline, linkOutline } from "ionicons/icons";
import type React from "react";

interface ImportSheetProps {
	isOpen: boolean;
	onClose: () => void;
	onPickFile: () => void;
	onPickClipboard: () => void;
	onPickUrl: () => void;
}

type Source = {
	key: "file" | "clipboard" | "url";
	icon: string;
	title: string;
	subtitle: string;
};

const SOURCES: Source[] = [
	{
		key: "file",
		icon: documentOutline,
		title: "Import file",
		subtitle: "TXT, EPUB, HTML, PDF",
	},
	{
		key: "clipboard",
		icon: clipboardOutline,
		title: "Paste text",
		subtitle: "From clipboard",
	},
	{
		key: "url",
		icon: linkOutline,
		title: "Import from URL",
		subtitle: "Fetch an article",
	},
];

/**
 * Bottom-sheet picker for import sources. Opens from the library FAB and
 * scales cleanly as new sources (PDF, Calibre, …) are added — each is a row
 * with icon + title + subtitle instead of one ragged centered label.
 */
const ImportSheet: React.FC<ImportSheetProps> = ({
	isOpen,
	onClose,
	onPickFile,
	onPickClipboard,
	onPickUrl,
}) => {
	const handlers: Record<Source["key"], () => void> = {
		file: onPickFile,
		clipboard: onPickClipboard,
		url: onPickUrl,
	};

	const handlePick = (key: Source["key"]) => {
		onClose();
		handlers[key]();
	};

	return (
		<IonModal
			isOpen={isOpen}
			onDidDismiss={onClose}
			breakpoints={[0, 0.45]}
			initialBreakpoint={0.45}
			handle
		>
			<IonContent>
				<div className="px-5 pt-4 pb-2">
					<h2 className="m-0 text-lg font-semibold">Add a book</h2>
				</div>
				<IonList lines="full">
					{SOURCES.map((s) => (
						<IonItem
							key={s.key}
							button
							detail={false}
							onClick={() => handlePick(s.key)}
						>
							<IonIcon icon={s.icon} slot="start" aria-hidden />
							<IonLabel>
								<h3>{s.title}</h3>
								<p>{s.subtitle}</p>
							</IonLabel>
						</IonItem>
					))}
				</IonList>
			</IonContent>
		</IonModal>
	);
};

export default ImportSheet;
