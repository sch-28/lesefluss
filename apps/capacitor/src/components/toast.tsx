import { Toaster as SonnerToaster, toast as sonnerToast, useSonner } from "@lesefluss/ui/sonner";
import type React from "react";
import { useEffect } from "react";
import { confirmTick } from "../services/haptics";
import { recordEmit, ToastCard, type ToastCardKind } from "./toast-card";
import { updateToastBottom } from "./toast-offset";

/**
 * Global toast emitter. Wraps sonner so non-React callers (services, contexts)
 * can fire a toast without a hook. Mount <Toaster /> once at the app root.
 */

export type ToastKind = "success" | "danger" | "warning" | "info";

export interface ToastOptions {
	duration?: number;
	/** A toast with the same id replaces the one showing. */
	id?: string;
	/** An action labelled "Undo" shows the countdown ring and ticks on tap. */
	action?: { label: string; onClick: () => void };
	/** "wishlist" makes it a wishlist toast: heart, primary colour, tick, shorter time. */
	icon?: "wishlist";
}

const DEFAULT_DURATION = 2500;
const WISHLIST_DURATION = 2200;
const ERROR_DURATION = 4000;

// Long enough to reach the action button; the default dismisses before most people react.
const ACTION_DURATION = 6000;

let version = 0;

function defaultDuration(kind: ToastCardKind, opts: ToastOptions): number {
	if (kind === "loading") return Number.POSITIVE_INFINITY;
	if (opts.action) return ACTION_DURATION;
	if (kind === "danger") return ERROR_DURATION;
	if (kind === "wishlist") return WISHLIST_DURATION;
	return DEFAULT_DURATION;
}

function emit(message: string, kind: ToastKind | "loading", opts: ToastOptions = {}) {
	const cardKind: ToastCardKind = opts.icon === "wishlist" ? "wishlist" : kind;
	if (cardKind === "success" || cardKind === "wishlist") confirmTick();
	updateToastBottom();
	version += 1;
	if (opts.id !== undefined) recordEmit(opts.id, version);
	const content = {
		kind: cardKind,
		message,
		action: opts.action,
		duration: opts.duration ?? defaultDuration(cardKind, opts),
		version,
	};
	// The card runs its own timer (pausing while held), so sonner's never fires.
	// An explicit `id: undefined` would override the id sonner hands the card, so the card's dismiss would miss.
	return sonnerToast.custom((id) => <ToastCard toastId={id} content={content} />, {
		...(opts.id === undefined ? {} : { id: opts.id }),
		duration: Number.POSITIVE_INFINITY,
	});
}

export const toast = {
	success: (msg: string, opts?: ToastOptions) => emit(msg, "success", opts),
	error: (msg: string, opts?: ToastOptions) => emit(msg, "danger", opts),
	warning: (msg: string, opts?: ToastOptions) => emit(msg, "warning", opts),
	info: (msg: string, opts?: ToastOptions) => emit(msg, "info", opts),
	/** Stays until a success or error with the same id replaces it. */
	loading: (msg: string, opts: ToastOptions & { id: string }) => emit(msg, "loading", opts),
	show: (msg: string, kind: ToastKind = "info", opts?: ToastOptions) => emit(msg, kind, opts),
	dismiss: (id: string) => sonnerToast.dismiss(id),
};

export function useToast() {
	return {
		showToast: (message: string, color: ToastKind = "success") => emit(message, color),
	};
}

const OFFSET_POLL_MS = 250;

/** `dark` follows the app's theme, not the OS one (passed in: this module must not import the theme context, which imports it). */
export const Toaster: React.FC<{ dark: boolean }> = ({ dark }) => {
	const hasToasts = useSonner().toasts.length > 0;
	// Bars open and close under a showing toast (selection mode, the reader's
	// controls), so the offset follows them while any toast is up.
	useEffect(() => {
		if (!hasToasts) return;
		updateToastBottom();
		const id = setInterval(updateToastBottom, OFFSET_POLL_MS);
		return () => clearInterval(id);
	}, [hasToasts]);
	return <SonnerToaster theme={dark ? "dark" : "light"} />;
};
