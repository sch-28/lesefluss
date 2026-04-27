import { IonToast } from "@ionic/react";
import {
	alertCircleOutline,
	checkmarkCircleOutline,
	informationCircleOutline,
	warningOutline,
} from "ionicons/icons";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import "./toast.css";

/**
 * Single global toast queue, decoupled from Ionic's `useIonToast` so that
 *   - non-React callers (services, contexts) can fire a toast without a hook,
 *   - the visual treatment lives in one place,
 *   - and consecutive toasts queue instead of clobbering each other.
 *
 * Mount `<Toaster />` once at the app root. Anywhere else, call
 * `toast.success(...)` / `toast.error(...)` / `toast.warning(...)` /
 * `toast.info(...)`. Components can still use the back-compat `useToast()`
 * hook — both paths feed the same emitter.
 */

export type ToastKind = "success" | "danger" | "warning" | "info";

export interface ToastOptions {
	duration?: number;
	icon?: string;
}

interface ToastEvent {
	id: number;
	message: string;
	kind: ToastKind;
	duration: number;
	icon: string;
}

const KIND_ICON: Record<ToastKind, string> = {
	success: checkmarkCircleOutline,
	danger: alertCircleOutline,
	warning: warningOutline,
	info: informationCircleOutline,
};

const DEFAULT_DURATION = 2500;

type Listener = (ev: ToastEvent) => void;

let listener: Listener | null = null;
const pendingEvents: ToastEvent[] = [];
let nextId = 0;

function emit(message: string, kind: ToastKind, opts: ToastOptions = {}) {
	const ev: ToastEvent = {
		id: ++nextId,
		message,
		kind,
		duration: opts.duration ?? DEFAULT_DURATION,
		icon: opts.icon ?? KIND_ICON[kind],
	};
	if (listener) listener(ev);
	else pendingEvents.push(ev);
}

export const toast = {
	success: (msg: string, opts?: ToastOptions) => emit(msg, "success", opts),
	error: (msg: string, opts?: ToastOptions) => emit(msg, "danger", opts),
	warning: (msg: string, opts?: ToastOptions) => emit(msg, "warning", opts),
	info: (msg: string, opts?: ToastOptions) => emit(msg, "info", opts),
	show: (msg: string, kind: ToastKind = "info", opts?: ToastOptions) => emit(msg, kind, opts),
};

/**
 * Back-compat hook — existing call sites kept working while the underlying
 * mechanism switched to the global emitter.
 */
export function useToast() {
	return {
		showToast: (message: string, color: ToastKind = "success") => emit(message, color),
	};
}

export const Toaster: React.FC = () => {
	const [current, setCurrent] = useState<ToastEvent | null>(null);
	const queueRef = useRef<ToastEvent[]>([]);
	const activeRef = useRef(false);
	const showNextRef = useRef<() => void>(() => {});

	useEffect(() => {
		const showNext = () => {
			const next = queueRef.current.shift();
			if (next) {
				activeRef.current = true;
				setCurrent(next);
			} else {
				activeRef.current = false;
				setCurrent(null);
			}
		};
		showNextRef.current = showNext;

		const myListener: Listener = (ev) => {
			queueRef.current.push(ev);
			if (!activeRef.current) showNext();
		};
		listener = myListener;

		// Drain anything emitted before mount (e.g. initial sync attempts).
		while (pendingEvents.length > 0) {
			const ev = pendingEvents.shift();
			if (ev) myListener(ev);
		}

		return () => {
			// Identity check so a still-mounted second Toaster (test wrapper /
			// hot-reload) keeps its listener if we're not the active one.
			if (listener === myListener) listener = null;
		};
	}, []);

	return (
		<IonToast
			key={current?.id}
			isOpen={!!current}
			message={current?.message}
			duration={current?.duration ?? DEFAULT_DURATION}
			icon={current?.icon}
			position="top"
			cssClass={current ? `lesefluss-toast lesefluss-toast--${current.kind}` : "lesefluss-toast"}
			onDidDismiss={() => showNextRef.current()}
		/>
	);
};
