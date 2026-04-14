import { IonIcon, IonItem, IonLabel, IonList, IonPopover } from "@ionic/react";
import { checkmarkOutline } from "ionicons/icons";
import type React from "react";
import { SORT_LABELS, type SortBy } from "./sort-filter";

interface SortPopoverProps {
	trigger: string;
	sortBy: SortBy;
	onSort: (s: SortBy) => void;
}

const SORT_OPTIONS: SortBy[] = ["recent", "title", "author", "progress"];

const SortPopover: React.FC<SortPopoverProps> = ({ trigger, sortBy, onSort }) => {
	return (
		<IonPopover trigger={trigger} triggerAction="click" dismissOnSelect>
			<IonList lines="none" style={{ minWidth: 140 }}>
				{SORT_OPTIONS.map((option) => (
					<IonItem key={option} button detail={false} onClick={() => onSort(option)}>
						<IonLabel>{SORT_LABELS[option]}</IonLabel>
						{sortBy === option && <IonIcon slot="end" icon={checkmarkOutline} />}
					</IonItem>
				))}
			</IonList>
		</IonPopover>
	);
};

export default SortPopover;
