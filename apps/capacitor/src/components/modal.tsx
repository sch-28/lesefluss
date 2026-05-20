import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@lesefluss/ui/dialog";
import type React from "react";

export interface ModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	children: React.ReactNode;
	footer?: React.ReactNode;
	/** When false, suppresses backdrop/escape dismiss. Default true. */
	dismissable?: boolean;
	contentClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
	open,
	onOpenChange,
	title,
	description,
	children,
	footer,
	dismissable = true,
	contentClassName,
}) => {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={dismissable}
				onInteractOutside={(e) => {
					if (!dismissable) e.preventDefault();
				}}
				onEscapeKeyDown={(e) => {
					if (!dismissable) e.preventDefault();
				}}
				className={contentClassName}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				<div className="flex flex-col gap-3">{children}</div>
				{footer && <DialogFooter>{footer}</DialogFooter>}
			</DialogContent>
		</Dialog>
	);
};
