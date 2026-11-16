import { Button } from "@lesefluss/ui/button";
import type React from "react";

type Props = {
	canSave: boolean;
	isPending: boolean;
	onUpdate: () => void;
	className?: string;
};

/**
 * Saves an edited shelf's filter back to it. A shelf with no filter can't be saved, and a
 * disabled button can't show why on touch or hover, so the reason replaces the button.
 */
export const UpdateShelfAction: React.FC<Props> = ({ canSave, isPending, onUpdate, className }) =>
	canSave ? (
		<Button
			size="sm"
			variant="outline"
			className={className}
			disabled={isPending}
			onClick={onUpdate}
		>
			Update shelf
		</Button>
	) : (
		<p className={`m-0 ml-2 text-muted-foreground text-xs ${className ?? ""}`}>
			Add a filter to update this shelf
		</p>
	);
