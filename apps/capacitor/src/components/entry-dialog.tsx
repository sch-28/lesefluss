import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import type React from "react";
import { FINE_POINTER_QUERY, useDesktopOverlay, useMediaQuery } from "../hooks/use-media-query";
import { Modal } from "./modal";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	/** When false, neither a swipe, the backdrop nor Escape closes it. Default true. */
	dismissable?: boolean;
	/** Applies to the desktop dialog only. */
	contentClassName?: string;
	/** False for a dialog that mostly shows facts: it opens focused, not its first field. Default true. */
	focusesField?: boolean;
	children: React.ReactNode;
};

const TEXT_FIELD = "input:not([type=hidden]):not(:disabled), textarea:not(:disabled)";

/**
 * With a mouse the user types next, so the first text field takes focus (not a
 * button above it). On touch focus stays off the field, so the keyboard stays
 * closed until a field is tapped.
 */
function focusFirstField(e: Event) {
	e.preventDefault();
	const dialog = e.currentTarget as HTMLElement | null;
	const field = dialog?.querySelector<HTMLElement>(TEXT_FIELD);
	(field ?? dialog)?.focus();
}

function focusDialog(e: Event) {
	e.preventDefault();
	(e.currentTarget as HTMLElement | null)?.focus();
}

/**
 * A short text-entry dialog: a bottom sheet on touch, a centred dialog on a wide
 * screen with a mouse, web or native. On touch the native shell resizes the
 * WebView for the on-screen keyboard, which re-centres a dialog mid-animation
 * and makes it and the page behind jump; a sheet stays docked to the bottom.
 */
export const EntryDialog: React.FC<Props> = ({
	open,
	onOpenChange,
	title,
	description,
	dismissable = true,
	contentClassName,
	focusesField = true,
	children,
}) => {
	const isDesktop = useDesktopOverlay();
	const isFinePointer = useMediaQuery(FINE_POINTER_QUERY);
	const onMouseOpen = focusesField ? focusFirstField : focusDialog;

	if (isDesktop) {
		return (
			<Modal
				open={open}
				onOpenChange={onOpenChange}
				title={title}
				description={description}
				dismissable={dismissable}
				contentClassName={contentClassName}
				onOpenAutoFocus={onMouseOpen}
			>
				{children}
			</Modal>
		);
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange} dismissible={dismissable}>
			<DrawerContent onOpenAutoFocus={isFinePointer ? onMouseOpen : undefined}>
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
					{description && <DrawerDescription>{description}</DrawerDescription>}
				</DrawerHeader>
				<div className="flex flex-col gap-3 px-5 pb-5">{children}</div>
			</DrawerContent>
		</Drawer>
	);
};
