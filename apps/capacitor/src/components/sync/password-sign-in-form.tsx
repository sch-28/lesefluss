import { Button } from "@lesefluss/ui/button";
import { Field, FieldError, FieldLabel } from "@lesefluss/ui/field";
import { Input } from "@lesefluss/ui/input";
import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { useId, useState } from "react";
import { useSyncContext } from "@/contexts/sync-context";
import { NATIVE_SYNC_ENABLED, openBrowserSignIn, SIGN_IN_FAILED_MESSAGE } from "@/services/sync";
import { PhoneSignInDialog } from "./phone-sign-in-dialog";

/**
 * Email + password sign-in that never leaves the app, for devices whose
 * browser cannot render the website. Social accounts still go through the
 * browser, offered underneath. Native builds only: the web build is signed in
 * by the site's own cookie session.
 */
export function PasswordSignInForm({
	beforeBrowserSignIn,
	className,
}: {
	/** Runs before the browser opens, e.g. to finish onboarding first. */
	beforeBrowserSignIn?: () => Promise<void> | void;
	className?: string;
}) {
	const { signInWithPassword } = useSyncContext();
	const id = useId();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isPending, setIsPending] = useState(false);
	const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);
	const [isPhoneDialogOpen, setIsPhoneDialogOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!NATIVE_SYNC_ENABLED) return null;

	const canSubmit = email.trim() !== "" && password !== "" && !isPending;

	const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!canSubmit) return;
		setIsPending(true);
		setError(null);
		try {
			await signInWithPassword(email.trim(), password);
			setPassword("");
		} catch (err) {
			setError(err instanceof Error ? err.message : SIGN_IN_FAILED_MESSAGE);
		} finally {
			setIsPending(false);
		}
	};

	const handleBrowserSignIn = async () => {
		setIsOpeningBrowser(true);
		setError(null);
		try {
			await beforeBrowserSignIn?.();
			await openBrowserSignIn();
		} catch {
			setError("Couldn't open a browser on this device.");
		} finally {
			setIsOpeningBrowser(false);
		}
	};

	return (
		<div className={cn("flex flex-col gap-4", className)}>
			<form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
				<Field>
					<FieldLabel htmlFor={`${id}-email`}>Email</FieldLabel>
					<Input
						id={`${id}-email`}
						type="email"
						inputMode="email"
						autoComplete="email"
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck={false}
						placeholder="you@example.com"
						value={email}
						onChange={(e) => {
							setEmail(e.target.value);
							setError(null);
						}}
						disabled={isPending}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor={`${id}-password`}>Password</FieldLabel>
					<Input
						id={`${id}-password`}
						type="password"
						autoComplete="current-password"
						placeholder="••••••••"
						value={password}
						onChange={(e) => {
							setPassword(e.target.value);
							setError(null);
						}}
						disabled={isPending}
					/>
				</Field>
				{error && <FieldError>{error}</FieldError>}
				<Button type="submit" className="w-full" disabled={!canSubmit}>
					{isPending ? "Signing in…" : "Sign in"}
				</Button>
			</form>
			<div className="flex flex-col gap-2">
				<p className="m-0 text-muted-foreground text-xs">
					Google or Discord account, or no account yet? Confirm a code with your phone, or continue
					in your browser.
				</p>
				<Button
					type="button"
					variant="outline"
					className="w-full"
					onClick={() => setIsPhoneDialogOpen(true)}
				>
					Sign in with your phone
				</Button>
				<Button
					type="button"
					variant="outline"
					className="w-full"
					onClick={handleBrowserSignIn}
					disabled={isOpeningBrowser}
				>
					{isOpeningBrowser ? "Opening browser…" : "Sign in in your browser"}
				</Button>
			</div>
			<PhoneSignInDialog open={isPhoneDialogOpen} onOpenChange={setIsPhoneDialogOpen} />
		</div>
	);
}
