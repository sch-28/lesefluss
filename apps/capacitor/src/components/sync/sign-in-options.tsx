import { Button } from "@lesefluss/ui/button";
import { Field, FieldError, FieldLabel } from "@lesefluss/ui/field";
import { Input } from "@lesefluss/ui/input";
import { cn } from "@lesefluss/ui/utils";
import { ArrowRight, ChevronDown, Globe, type LucideIcon, Smartphone } from "lucide-react";
import type React from "react";
import { useId, useState } from "react";
import { useSyncContext } from "@/contexts/sync-context";
import { useTheme } from "@/contexts/theme-context";
import { NATIVE_SYNC_ENABLED, openBrowserSignIn, SIGN_IN_FAILED_MESSAGE } from "@/services/sync";
import { PhoneSignInDialog } from "./phone-sign-in-dialog";

type SignInOption = {
	icon: LucideIcon;
	title: string;
	description: string;
	onClick: () => void;
	disabled?: boolean;
	error?: string | null;
};

function PrimaryOption({ icon: Icon, title, description, onClick, disabled, error }: SignInOption) {
	const descriptionId = useId();
	return (
		<div className="flex flex-col gap-2">
			<Button
				type="button"
				className="h-12 w-full text-base"
				aria-describedby={descriptionId}
				onClick={onClick}
				disabled={disabled}
			>
				<Icon className="size-5" />
				<span className="flex-1 text-left">{title}</span>
				<ArrowRight className="size-5" />
			</Button>
			<p id={descriptionId} className="m-0 px-1 text-muted-foreground text-xs">
				{description}
			</p>
			{error && <FieldError>{error}</FieldError>}
		</div>
	);
}

function SecondaryOption({
	icon: Icon,
	title,
	description,
	onClick,
	disabled,
	error,
}: SignInOption) {
	const descriptionId = useId();
	return (
		<div className="flex flex-col gap-2">
			<button
				type="button"
				aria-label={title}
				aria-describedby={descriptionId}
				onClick={onClick}
				disabled={disabled}
				className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/60 disabled:opacity-50"
			>
				<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
					<Icon className="size-5" />
				</span>
				<span className="flex flex-1 flex-col">
					<span className="font-medium text-foreground text-sm">{title}</span>
					<span id={descriptionId} className="text-muted-foreground text-xs">
						{description}
					</span>
				</span>
			</button>
			{error && <FieldError>{error}</FieldError>}
		</div>
	);
}

/**
 * Native sign-in. The browser (covers Google, Discord and sign-up) and the
 * phone code are the main paths; email + password in the app is the fallback
 * for devices with neither. Native builds only: the web build is signed in by
 * the site's own cookie session.
 */
export function SignInOptions({
	beforeBrowserSignIn,
	className,
}: {
	/** Runs before the browser opens, e.g. to finish onboarding first. */
	beforeBrowserSignIn?: () => Promise<void> | void;
	className?: string;
}) {
	const { signInWithPassword } = useSyncContext();
	const { isEinkMode } = useTheme();
	const id = useId();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isPending, setIsPending] = useState(false);
	const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);
	const [isPhoneDialogOpen, setIsPhoneDialogOpen] = useState(false);
	const [isEmailFormOpen, setIsEmailFormOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [browserError, setBrowserError] = useState<string | null>(null);

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
		setBrowserError(null);
		try {
			await beforeBrowserSignIn?.();
			await openBrowserSignIn();
		} catch {
			setBrowserError("Couldn't open a browser on this device.");
		} finally {
			setIsOpeningBrowser(false);
		}
	};

	const browserOption: SignInOption = {
		icon: Globe,
		title: isOpeningBrowser ? "Opening browser…" : "Continue in your browser",
		description: "Google, Discord or email. New here? Create your account there too.",
		onClick: handleBrowserSignIn,
		disabled: isOpeningBrowser,
		error: browserError,
	};

	const phoneOption: SignInOption = {
		icon: Smartphone,
		title: "Sign in with your phone",
		description: "Scan a code with your phone and confirm there. Nothing to type on this screen.",
		onClick: () => setIsPhoneDialogOpen(true),
	};

	// Typing on e-ink is slow and its browser often can't render the site; the phone does the work.
	const [primary, secondary] = isEinkMode
		? [phoneOption, browserOption]
		: [browserOption, phoneOption];

	return (
		<div className={cn("flex flex-col gap-4", className)}>
			<PrimaryOption {...primary} />
			<SecondaryOption {...secondary} />

			<div className="mt-2 flex flex-col items-center gap-1">
				<p className="m-0 text-muted-foreground text-xs">No browser or phone at hand?</p>
				<Button
					type="button"
					variant="ghost"
					className="min-h-11"
					aria-expanded={isEmailFormOpen}
					aria-controls={isEmailFormOpen ? `${id}-email-form` : undefined}
					disabled={isPending}
					onClick={() => {
						setIsEmailFormOpen((open) => !open);
						setError(null);
					}}
				>
					Sign in with email and password
					<ChevronDown className={cn("transition-transform", isEmailFormOpen && "rotate-180")} />
				</Button>
			</div>

			{isEmailFormOpen && (
				<form
					id={`${id}-email-form`}
					onSubmit={handleSubmit}
					className="flex flex-col gap-3"
					noValidate
				>
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
					<Button type="submit" variant="outline" className="w-full" disabled={!canSubmit}>
						{isPending ? "Signing in…" : "Sign in"}
					</Button>
				</form>
			)}
			<PhoneSignInDialog open={isPhoneDialogOpen} onOpenChange={setIsPhoneDialogOpen} />
		</div>
	);
}
