import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@lesefluss/ui/alert-dialog";
import { Button } from "@lesefluss/ui/button";
import { Field, FieldError, FieldLabel } from "@lesefluss/ui/field";
import { Input } from "@lesefluss/ui/input";
import { UserX } from "lucide-react";
import { useId, useState } from "react";
import { useToast } from "@/components/toast";
import { useSyncContext } from "@/contexts/sync-context";
import { deleteAccount, IS_WEB_BUILD } from "@/services/sync";

const CONFIRM_WORD = "DELETE";

/** A danger-zone row that deletes the signed-in account after a typed confirm. */
export function DeleteAccountRow() {
	const { logout } = useSyncContext();
	const { showToast } = useToast();
	const inputId = useId();
	const [isOpen, setIsOpen] = useState(false);
	const [typed, setTyped] = useState("");
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const close = (open: boolean) => {
		if (open || isPending) return;
		setIsOpen(false);
		setTyped("");
		setError(null);
	};

	const confirm = async () => {
		setIsPending(true);
		setError(null);
		try {
			await deleteAccount();
		} catch {
			setError("Couldn't delete your account. Check your connection and try again.");
			setIsPending(false);
			return;
		}
		if (IS_WEB_BUILD) {
			// The site's cookie session died with the account; the site re-renders signed out.
			window.top?.location.assign("/");
			return;
		}
		await logout();
		setIsPending(false);
		setIsOpen(false);
		showToast("Your account was deleted", "success");
	};

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
			>
				<UserX className="size-5 text-destructive" />
				<div className="flex-1">
					<div className="font-semibold text-destructive text-sm">Delete account</div>
					<div className="text-muted-foreground text-xs">
						Your account and everything stored in the cloud
					</div>
				</div>
			</button>

			<AlertDialog open={isOpen} onOpenChange={close}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete your account?</AlertDialogTitle>
						<AlertDialogDescription>
							Deletes your account, your social profile and everything synced to the cloud: books,
							highlights, glossary, reading stats and settings. Friends lose you from their lists.
							The books on this device stay until you delete them here. This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Field>
						<FieldLabel htmlFor={inputId}>Type {CONFIRM_WORD} to confirm</FieldLabel>
						<Input
							id={inputId}
							value={typed}
							autoCapitalize="characters"
							autoComplete="off"
							autoCorrect="off"
							spellCheck={false}
							onChange={(e) => setTyped(e.target.value)}
							disabled={isPending}
						/>
					</Field>
					{error && <FieldError>{error}</FieldError>}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
						<Button
							variant="destructive"
							disabled={typed.trim() !== CONFIRM_WORD || isPending}
							onClick={confirm}
						>
							{isPending ? "Deleting…" : "Delete account"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
