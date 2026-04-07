/**
 * TransferModal
 *
 * Self-contained two-phase modal for uploading a book to the ESP32.
 * Owns all transfer state; Library.tsx just controls isOpen/onDismiss.
 *
 * Phase routing:
 *   confirm     → ConfirmPhase    (book info, size, warnings, Upload button)
 *   transferring → TransferringPhase (progress bar, chunks, timing)
 *   done        → DonePhase       (success + Close)
 *   error       → ErrorPhase      (error message + Close)
 */

import {
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonModal,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBookSync } from "../../../contexts/book-sync-context";
import type { Book } from "../../../services/db/schema";
import { log } from "../../../utils/log";
import ConfirmPhase from "./confirm-phase";
import { DonePhase, ErrorPhase, TransferringPhase } from "./progress-phases";

type Phase = "confirm" | "transferring" | "done" | "error";

const PHASE_TITLE: Record<Phase, string> = {
	confirm: "Upload to device",
	transferring: "Uploading…",
	done: "Upload complete",
	error: "Upload failed",
};

interface Props {
	isOpen: boolean;
	book: Book | null;
	/** Book currently on the device, if any — shown as replacement warning. */
	activeBook: Book | null;
	onDismiss: () => void;
}

const TransferModal: React.FC<Props> = ({ isOpen, book, activeBook, onDismiss }) => {
	const { transferBook } = useBookSync();

	const [phase, setPhase] = useState<Phase>("confirm");
	const [progress, setProgress] = useState(0);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const startTimeRef = useRef<number | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const wakeLockRef = useRef<WakeLockSentinel | null>(null);

	// Reset to confirm whenever the modal (re-)opens
	useEffect(() => {
		if (isOpen) {
			setPhase("confirm");
			setProgress(0);
			setErrorMsg(null);
			setElapsed(0);
			startTimeRef.current = null;
		}
	}, [isOpen, book?.id]);

	// Elapsed ticker — only runs while transferring
	useEffect(() => {
		if (phase === "transferring") {
			timerRef.current = setInterval(() => {
				if (startTimeRef.current != null) {
					setElapsed((Date.now() - startTimeRef.current) / 1000);
				}
			}, 500);
		} else {
			if (timerRef.current) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
		}
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, [phase]);

	// Screen wake lock — keep display on while transferring
	useEffect(() => {
		if (phase === "transferring") {
			if ("wakeLock" in navigator) {
				navigator.wakeLock
					.request("screen")
					.then((lock) => {
						wakeLockRef.current = lock;
					})
					.catch((err) => {
						log.warn("transfer", "wake lock request failed:", err);
					});
			}
		} else {
			if (wakeLockRef.current) {
				wakeLockRef.current.release().catch(() => {});
				wakeLockRef.current = null;
			}
		}
		return () => {
			if (wakeLockRef.current) {
				wakeLockRef.current.release().catch(() => {});
				wakeLockRef.current = null;
			}
		};
	}, [phase]);

	const handleUpload = useCallback(async () => {
		if (!book) return;
		setPhase("transferring");
		setProgress(0);
		startTimeRef.current = Date.now();
		try {
			await transferBook(book.id, (pct) => setProgress(pct));
			setPhase("done");
		} catch (err) {
			setErrorMsg(err instanceof Error ? err.message : "Transfer failed");
			setPhase("error");
		}
	}, [book, transferBook]);

	if (!book) return null;

	return (
		<IonModal isOpen={isOpen} onDidDismiss={onDismiss} backdropDismiss={phase === "confirm"}>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonTitle>{PHASE_TITLE[phase]}</IonTitle>
					{phase === "confirm" && (
						<IonButtons slot="end">
							<IonButton onClick={onDismiss}>Cancel</IonButton>
						</IonButtons>
					)}
				</IonToolbar>
			</IonHeader>

			<IonContent className="ion-padding">
				{phase === "confirm" && (
					<ConfirmPhase book={book} activeBook={activeBook} onUpload={handleUpload} />
				)}
				{phase === "transferring" && (
					<TransferringPhase book={book} progress={progress} elapsed={elapsed} />
				)}
				{phase === "done" && <DonePhase book={book} onClose={onDismiss} />}
				{phase === "error" && <ErrorPhase message={errorMsg} onClose={onDismiss} />}
			</IonContent>
		</IonModal>
	);
};

export default TransferModal;
