import { Toaster as SonnerToaster, toast as sonnerToast } from "@lesefluss/ui/sonner";
import type React from "react";

/**
 * Global toast emitter. Wraps sonner so non-React callers (services, contexts)
 * can fire a toast without a hook. Mount <Toaster /> once at the app root.
 */

export type ToastKind = "success" | "danger" | "warning" | "info";

export interface ToastOptions {
	duration?: number;
	action?: { label: string; onClick: () => void };
}

const DEFAULT_DURATION = 2500;

// Long enough to reach the action button; the default dismisses before most people react.
const ACTION_DURATION = 6000;

function emit(message: string, kind: ToastKind, opts: ToastOptions = {}) {
	const options = {
		duration: opts.duration ?? (opts.action ? ACTION_DURATION : DEFAULT_DURATION),
		action: opts.action,
	};
	switch (kind) {
		case "success":
			sonnerToast.success(message, options);
			break;
		case "danger":
			sonnerToast.error(message, options);
			break;
		case "warning":
			sonnerToast.warning(message, options);
			break;
		default:
			sonnerToast.info(message, options);
	}
}

export const toast = {
	success: (msg: string, opts?: ToastOptions) => emit(msg, "success", opts),
	error: (msg: string, opts?: ToastOptions) => emit(msg, "danger", opts),
	warning: (msg: string, opts?: ToastOptions) => emit(msg, "warning", opts),
	info: (msg: string, opts?: ToastOptions) => emit(msg, "info", opts),
	show: (msg: string, kind: ToastKind = "info", opts?: ToastOptions) => emit(msg, kind, opts),
};

export function useToast() {
	return {
		showToast: (message: string, color: ToastKind = "success") => emit(message, color),
	};
}

export const Toaster: React.FC = () => {
	return <SonnerToaster richColors />;
};
