import { IonIcon, IonItem, IonLabel, IonList, IonPopover } from "@ionic/react";
import { checkmarkOutline } from "ionicons/icons";
import type React from "react";

type Props<T extends string> = {
	trigger: string;
	options: readonly T[];
	labels: Record<T, string>;
	selected: T;
	onSelect: (value: T) => void;
	minWidth?: number;
};

/**
 * Checkmark-style popover keyed by a string enum. Shared by Library's
 * Sort and Filter menus — add more call sites here rather than cloning.
 */
function SelectionPopover<T extends string>({
	trigger,
	options,
	labels,
	selected,
	onSelect,
	minWidth = 140,
}: Props<T>): React.ReactElement {
	return (
		<IonPopover trigger={trigger} triggerAction="click" dismissOnSelect>
			<IonList lines="none" style={{ minWidth }}>
				{options.map((option) => (
					<IonItem key={option} button detail={false} onClick={() => onSelect(option)}>
						<IonLabel>{labels[option]}</IonLabel>
						{selected === option && <IonIcon slot="end" icon={checkmarkOutline} />}
					</IonItem>
				))}
			</IonList>
		</IonPopover>
	);
}

export default SelectionPopover;
