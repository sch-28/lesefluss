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
	IonPage,
	IonRadio,
	IonRadioGroup,
	IonSelect,
	IonSelectOption,
	IonSpinner,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import { useMutation } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { useToast } from "../../components/toast";
import { queryHooks } from "../../services/db/hooks";
import { type ExportFormat, type ExportScope, exportHighlights } from "../../services/export";

function parseScope(value: string): ExportScope {
	if (value === "all") return { type: "all" };
	if (value.startsWith("series:")) return { type: "series", id: value.slice(7) };
	return { type: "book", id: value.slice(5) };
}

const ExportSettings: React.FC = () => {
	const { showToast } = useToast();
	const { data: booksData } = queryHooks.useBooks();
	const { data: seriesList } = queryHooks.useSeriesList();
	const books = booksData?.books;

	const [selectValue, setSelectValue] = useState("all");
	const [format, setFormat] = useState<ExportFormat>("markdown");

	const exportMutation = useMutation({
		mutationFn: () => exportHighlights({ format, scope: parseScope(selectValue) }),
		onSuccess: () => showToast("Highlights exported", "success"),
		onError: (err: Error) => showToast(err.message || "Export failed", "danger"),
	});

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/settings" />
					</IonButtons>
					<IonTitle>Export Highlights</IonTitle>
				</IonToolbar>
			</IonHeader>
			<IonContent>
				<IonList className="content-container">
					<IonListHeader>
						<IonLabel>Book</IonLabel>
					</IonListHeader>
					<IonItem>
						<IonSelect
							value={selectValue}
							onIonChange={(e) => setSelectValue(e.detail.value)}
							interface="action-sheet"
							label="Select book"
							labelPlacement="floating"
						>
							<IonSelectOption value="all">All Books</IonSelectOption>
							{books?.map((book) => (
								<IonSelectOption key={book.id} value={`book:${book.id}`}>
									{book.title}
								</IonSelectOption>
							))}
							{seriesList?.map((s) => (
								<IonSelectOption key={s.id} value={`series:${s.id}`}>
									{s.title}
								</IonSelectOption>
							))}
						</IonSelect>
					</IonItem>

					<IonListHeader>
						<IonLabel>Format</IonLabel>
					</IonListHeader>
					<IonRadioGroup
						value={format}
						onIonChange={(e) => setFormat(e.detail.value as ExportFormat)}
					>
						<IonItem>
							<IonRadio value="markdown" justify="space-between">
								Markdown
							</IonRadio>
						</IonItem>
						<IonItem>
							<IonRadio value="csv" justify="space-between">
								CSV
							</IonRadio>
						</IonItem>
					</IonRadioGroup>

					<div className="ion-padding">
						<IonButton
							expand="block"
							onClick={() => exportMutation.mutate()}
							disabled={exportMutation.isPending}
						>
							{exportMutation.isPending ? <IonSpinner name="crescent" /> : "Export"}
						</IonButton>
					</div>
				</IonList>
			</IonContent>
		</IonPage>
	);
};

export default ExportSettings;
