import { Button } from "@lesefluss/ui/button";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasOpenOverlay } from "../../commands/guard";
import { formatKey, matchesKey } from "../../commands/keys";
import { PageHeader } from "../../components/app-shell/page-header";
import { tabBarHidden } from "../../components/app-shell/tab-bar-visibility";
import { PageContainer } from "../../components/page-container";
import { useMediaQuery } from "../../hooks/use-media-query";
import type { EditForm } from "./book-edit-fields";
import type { BookEditValues } from "./book-edit-form";

const SAVE_KEY = "Mod+s";

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
			if (matchesKey(e, SAVE_KEY)) {
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

	const actions = (
		<>
			<Button
				variant="outline"
				className="flex-1 md:flex-none"
				onClick={onCancel}
				disabled={isBusy}
			>
				{cancelLabel}
			</Button>
			<Button className="flex-1 md:flex-none" onClick={onSave} disabled={!canSave || isBusy}>
				{isSaving && <Loader2 className="size-4 animate-spin" />}
				{saveLabel}
			</Button>
		</>
	);

	return (
		<div className="flex min-h-full flex-col">
			{/* Back asks first when there are unsaved changes, as Cancel does: one Cancel, on the bar. */}
			<PageHeader
				title={title}
				width="text"
				onBack={() => {
					if (!isBusy) onCancel();
				}}
				right={
					<>
						<div className="min-w-0 shrink truncate text-muted-foreground text-xs">{status}</div>
						{isWide && <div className="flex shrink-0 gap-2">{actions}</div>}
					</>
				}
			/>
			<PageContainer as="main" width="text" className="flex-1 px-4 py-4 pb-24 md:pb-8">
				{children}
				{isWide && (
					<p className="m-0 mt-4 text-center text-muted-foreground text-xs">
						{formatKey(SAVE_KEY).join("+")} save · Esc cancel (asks when unsaved)
					</p>
				)}
			</PageContainer>
			{!isWide && (
				<div
					data-toast-clear
					className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-card pb-[var(--safe-bottom)]"
				>
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
