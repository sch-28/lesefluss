import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@lesefluss/ui/alert-dialog";
import { cn } from "@lesefluss/ui/utils";
import type React from "react";

export type ConfirmDialogVariant = "confirm" | "info";

export interface ConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
	variant?: ConfirmDialogVariant;
	onConfirm?: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel,
	cancelLabel = "Cancel",
	destructive,
	variant = "confirm",
	onConfirm,
}) => {
	const isInfo = variant === "info";
	const action = confirmLabel ?? (isInfo ? "OK" : "Confirm");
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					{description && <AlertDialogDescription>{description}</AlertDialogDescription>}
				</AlertDialogHeader>
				<AlertDialogFooter>
					{!isInfo && <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>}
					<AlertDialogAction
						onClick={onConfirm}
						className={cn(
							destructive && "bg-destructive text-white hover:bg-destructive/90",
						)}
					>
						{action}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
