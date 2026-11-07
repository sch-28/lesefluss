import { Capacitor } from "@capacitor/core";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import type React from "react";
import { useMediaQuery } from "../hooks/use-media-query";
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
	children: React.ReactNode;
};

/**
 * A short text-entry dialog: a bottom sheet in the native app at any width and
 * on narrow web, a centred dialog on wide web. The native shell resizes the
 * WebView for the keyboard, which re-centres a dialog mid-animation and makes
 * it and the page behind jump; a sheet stays docked to the bottom.
 */
export const EntryDialog: React.FC<Props> = ({
	open,
	onOpenChange,
	title,
	description,
	dismissable = true,
	contentClassName,
	children,
}) => {
	const isWideWeb = useMediaQuery("(min-width: 768px)") && !Capacitor.isNativePlatform();

	if (isWideWeb) {
		return (
			<Modal
				open={open}
				onOpenChange={onOpenChange}
				title={title}
				description={description}
				dismissable={dismissable}
				contentClassName={contentClassName}
			>
				{children}
			</Modal>
		);
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange} dismissible={dismissable}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
					{description && <DrawerDescription>{description}</DrawerDescription>}
				</DrawerHeader>
				<div className="flex flex-col gap-3 px-5 pb-5">{children}</div>
			</DrawerContent>
		</Drawer>
	);
};
