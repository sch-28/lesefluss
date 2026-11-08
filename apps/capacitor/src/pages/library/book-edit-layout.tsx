import { Button } from "@lesefluss/ui/button";
import { ChevronLeft, Loader2, X } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasOpenOverlay } from "../../commands/guard";
import { matchesKey } from "../../commands/keys";
import { tabBarHidden } from "../../components/app-shell/tab-bar-visibility";
import { useMediaQuery } from "../../hooks/use-media-query";
import type { EditForm } from "./book-edit-fields";
import type { BookEditValues } from "./book-edit-form";

export function useIsWideLayout(): boolean {
	return useMediaQuery("(min-width: 768px)");
}

/** Form state seeded from `initial`, reseeded whenever a different `initial` arrives. */
export function useEditForm(initial: BookEditValues): EditForm {
	const [values, setValues] = useState(initial);
	const [tagDraft, setTagDraft] = useState("");
	const [seed, setSeed] = useState(initial);
	if (seed !== initial) {
		setSeed(initial);
		setValues(initial);
		setTagDraft("");
	}
	const set = useCallback(
		<K extends keyof BookEditValues>(key: K, value: BookEditValues[K]) =>
			setValues((v) => ({ ...v, [key]: value })),
		[],
	);
	return { values, set, tagDraft, setTagDraft };
}

/**
 * ⌘S saves and Escape cancels. Not a registered command: commands stay out of
 * text fields, and saving from inside one is the point.
 */
function useSaveCancelKeys(onSave: () => void, onCancel: () => void) {
	const latest = useRef({ onSave, onCancel });
	latest.current = { onSave, onCancel };
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (matchesKey(e, "Mod+s")) {
				e.preventDefault();
				if (!hasOpenOverlay()) latest.current.onSave();
			} else if (e.key === "Escape" && !e.defaultPrevented && !hasOpenOverlay()) {
				latest.current.onCancel();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);
}

type Props = {
	title: string;
	closeIcon: "back" | "close";
	/** Beside the title: "● Unsaved", "1 of 3". */
	status?: React.ReactNode;
	cancelLabel: string;
	saveLabel: string;
	onCancel: () => void;
	onSave: () => void;
	canSave: boolean;
	isSaving: boolean;
	isBusy: boolean;
	children: React.ReactNode;
};

/**
 * The edit and import pages' frame: a header with the actions on desktop, a
 * bottom bar in the tab bar's place on a phone.
 */
export const BookEditLayout: React.FC<Props> = ({
	title,
	closeIcon,
	status,
	cancelLabel,
	saveLabel,
	onCancel,
	onSave,
	canSave,
	isSaving,
	isBusy,
	children,
}) => {
	const isWide = useIsWideLayout();
	useSaveCancelKeys(
		() => {
			if (canSave && !isBusy) onSave();
		},
		() => {
			if (!isBusy) onCancel();
		},
	);
	useEffect(() => {
		if (isWide) return;
		tabBarHidden.set(true);
		return () => tabBarHidden.set(false);
	}, [isWide]);

	const CloseIcon = closeIcon === "back" ? ChevronLeft : X;
	const actions = (
		<>
			<Button
				variant="outline"
				className="h-11 flex-1 md:h-9 md:flex-none"
				onClick={onCancel}
				disabled={isBusy}
			>
				{cancelLabel}
			</Button>
			<Button
				className="h-11 flex-1 md:h-9 md:flex-none"
				onClick={onSave}
				disabled={!canSave || isBusy}
			>
				{isSaving && <Loader2 className="size-4 animate-spin" />}
				{saveLabel}
			</Button>
		</>
	);

	return (
		<div className="flex min-h-full flex-col">
			<header className="sticky top-0 z-20 border-border border-b bg-background/95 pt-[var(--safe-top)] backdrop-blur">
				<div className="mx-auto flex h-12 max-w-4xl items-center gap-2 px-2 md:h-14 md:px-4">
					<button
						type="button"
						onClick={onCancel}
						disabled={isBusy}
						aria-label={cancelLabel}
						className="-ml-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
					>
						<CloseIcon className="size-5" />
					</button>
					<h1 className="m-0 font-semibold text-base leading-5">{title}</h1>
					<div className="min-w-0 flex-1 truncate text-muted-foreground text-xs">{status}</div>
					{isWide && <div className="flex gap-2">{actions}</div>}
				</div>
			</header>
			<main className="mx-auto w-full max-w-4xl flex-1 px-4 py-4 pb-24 md:pb-8">
				{children}
				{isWide && (
					<p className="m-0 mt-4 text-center text-muted-foreground text-xs">
						⌘S save · Esc cancel (asks when unsaved)
					</p>
				)}
			</main>
			{!isWide && (
				<div className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-card pb-[var(--safe-bottom)]">
					<div className="flex h-[var(--tab-bar-h)] items-center gap-2 px-4">{actions}</div>
				</div>
			)}
		</div>
	);
};

export const UnsavedMark: React.FC<{ isWide: boolean }> = ({ isWide }) => (
	<span className="text-amber-600 dark:text-amber-400">
		● {isWide ? "Unsaved changes" : "Unsaved"}
	</span>
);
