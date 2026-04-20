import type { AnyFieldApi } from "@tanstack/react-form";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { DiscordIcon } from "~/components/icons/discord";
import { GoogleIcon } from "~/components/icons/google";
import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { sendVerificationEmail, signIn, signUp } from "~/lib/auth-client";
import { useAuthSession } from "~/lib/session-context";
import { seo } from "~/utils/seo";

function isSafeRedirect(value: unknown): value is string {
	if (typeof value !== "string") return false;
	if (!value.startsWith("/") || value.startsWith("//")) return false;
	// Avoid bouncing back to login (reload loop) or exposing auth endpoints as redirect targets.
	if (value === "/login" || value.startsWith("/login/") || value.startsWith("/login?"))
		return false;
	if (value.startsWith("/api/")) return false;
	return true;
}

export const Route = createFileRoute("/login/")({
	validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
		isSafeRedirect(search.redirect) ? { redirect: search.redirect } : {},
	component: LoginPage,
	head: () =>
		seo({
			title: "Sign in - Lesefluss",
			description: "Sign in to Lesefluss to sync your library across devices.",
			path: "/login",
			isNoindex: true,
		}),
});

const signInSchema = z.object({
	name: z.string(),
	email: z.email("Enter a valid email"),
	password: z.string().min(8, "At least 8 characters"),
});

const signUpSchema = z.object({
	name: z.string().min(1, "Name is required"),
	email: z.email("Enter a valid email"),
	password: z.string().min(8, "At least 8 characters"),
});

function FormInput({
	field,
	label,
	...inputProps
}: { field: AnyFieldApi; label: string } & React.ComponentProps<"input">) {
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			<Input
				id={field.name}
				name={field.name}
				value={field.state.value as string}
				onBlur={field.handleBlur}
				onChange={(e) => field.handleChange(e.target.value)}
				aria-invalid={isInvalid}
				{...inputProps}
			/>
			{isInvalid && <FieldError errors={field.state.meta.errors} />}
		</Field>
	);
}

type Mode = "signin" | "signup";

function VerificationSent({ email, onBack }: { email: string; onBack: () => void }) {
	const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

	const handleResend = async () => {
		setStatus("sending");
		setErrorMessage(null);
		const { error } = await sendVerificationEmail({ email });
		if (error) {
			setStatus("error");
			setErrorMessage(error.message ?? "Failed to resend");
			return;
		}
		setStatus("sent");
	};

	return (
		<div className="rounded-lg border border-border bg-card px-5 py-6 text-center">
			<h2 className="font-semibold text-base">Check your email</h2>
			<p className="mt-2 text-muted-foreground text-sm">
				We sent a verification link to <span className="font-medium text-foreground">{email}</span>.
				Click it to activate your account.
			</p>
			<p className="mt-3 text-muted-foreground text-xs">Didn't get it? Check your spam folder.</p>
			<div className="mt-5 flex flex-col gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleResend}
					disabled={status === "sending" || status === "sent"}
				>
					{status === "sending"
						? "Sending…"
						: status === "sent"
							? "Email sent"
							: "Resend verification email"}
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={onBack}>
					Use a different email
				</Button>
			</div>
			{errorMessage && <p className="mt-3 text-destructive text-xs">{errorMessage}</p>}
		</div>
	);
}

type SocialProvider = "google" | "discord";

const SOCIAL_PROVIDERS: {
	id: SocialProvider;
	label: string;
	Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}[] = [
	{ id: "google", label: "Google", Icon: GoogleIcon },
	{ id: "discord", label: "Discord", Icon: DiscordIcon },
];

function SocialButton({
	provider,
	label,
	Icon,
	redirectTo,
}: {
	provider: SocialProvider;
	label: string;
	Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
	redirectTo: string;
}) {
	const [isLoading, setIsLoading] = React.useState(false);
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

	const handleClick = async () => {
		setIsLoading(true);
		setErrorMessage(null);
		const { error } = await signIn.social({ provider, callbackURL: redirectTo });
		if (error) {
			setErrorMessage(error.message ?? `${label} sign-in failed`);
			setIsLoading(false);
		}
	};

	return (
		<>
			<Button
				type="button"
				variant="outline"
				size="lg"
				className="w-full"
				onClick={handleClick}
				disabled={isLoading}
			>
				<Icon className="mr-2 size-4" />
				{isLoading ? "Redirecting…" : `Continue with ${label}`}
			</Button>
			{errorMessage && <p className="mt-2 text-center text-destructive text-xs">{errorMessage}</p>}
		</>
	);
}

function AuthForm({
	mode,
	redirectTo,
	hasExternalRedirect,
}: {
	mode: Mode;
	redirectTo: string;
	hasExternalRedirect: boolean;
}) {
	const navigate = useNavigate();
	const router = useRouter();
	const [serverError, setServerError] = React.useState<string | null>(null);
	const [verificationSentTo, setVerificationSentTo] = React.useState<string | null>(null);

	const form = useForm({
		defaultValues: { name: "", email: "", password: "" },
		validators: {
			onSubmit: mode === "signin" ? signInSchema : signUpSchema,
		},
		onSubmit: async ({ value }) => {
			setServerError(null);
			try {
				if (mode === "signin") {
					const result = await signIn.email({
						email: value.email,
						password: value.password,
					});
					if (result.error) throw new Error(result.error.message ?? "Sign in failed");
					if (hasExternalRedirect) {
						window.location.assign(redirectTo);
					} else {
						await router.invalidate();
						navigate({ to: "/profile" });
					}
				} else {
					const result = await signUp.email({
						email: value.email,
						password: value.password,
						name: value.name,
					});
					if (result.error) throw new Error(result.error.message ?? "Sign up failed");
					setVerificationSentTo(value.email);
				}
			} catch (err) {
				setServerError(err instanceof Error ? err.message : "Something went wrong");
			}
		},
	});

	if (verificationSentTo) {
		return (
			<VerificationSent
				email={verificationSentTo}
				onBack={() => {
					setVerificationSentTo(null);
					setServerError(null);
				}}
			/>
		);
	}

	return (
		<>
			<div className="flex flex-col gap-2">
				{SOCIAL_PROVIDERS.map(({ id, label, Icon }) => (
					<SocialButton key={id} provider={id} label={label} Icon={Icon} redirectTo={redirectTo} />
				))}
			</div>
			<div className="my-6 flex items-center gap-3">
				<div className="h-px flex-1 bg-border" />
				<span className="text-muted-foreground text-xs uppercase tracking-wider">or</span>
				<div className="h-px flex-1 bg-border" />
			</div>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				<FieldGroup className="gap-4">
					{mode === "signup" && (
						<form.Field name="name">
							{(field) => (
								<FormInput field={field} label="Name" placeholder="Your name" autoComplete="name" />
							)}
						</form.Field>
					)}

					<form.Field name="email">
						{(field) => (
							<FormInput
								field={field}
								label="Email"
								type="email"
								placeholder="you@example.com"
								autoComplete="email"
							/>
						)}
					</form.Field>

					<form.Field name="password">
						{(field) => (
							<FormInput
								field={field}
								label="Password"
								type="password"
								placeholder="••••••••"
								autoComplete={mode === "signin" ? "current-password" : "new-password"}
							/>
						)}
					</form.Field>
				</FieldGroup>

				{serverError && (
					<p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-destructive text-sm">
						{serverError}
					</p>
				)}

				<form.Subscribe selector={(s) => s.isSubmitting}>
					{(isSubmitting) => (
						<Button type="submit" disabled={isSubmitting} className="mt-6 w-full" size="lg">
							{isSubmitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
						</Button>
					)}
				</form.Subscribe>
			</form>
		</>
	);
}

function LoginPage() {
	const session = useAuthSession();
	const navigate = useNavigate();
	const { redirect } = Route.useSearch();
	const hasExternalRedirect = redirect !== undefined;
	const redirectTo = redirect ?? "/profile";
	const [mode, setMode] = React.useState<Mode>("signin");

	React.useEffect(() => {
		if (!session?.user) return;
		if (hasExternalRedirect) window.location.assign(redirectTo);
		else navigate({ to: "/profile" });
	}, [session, hasExternalRedirect, redirectTo, navigate]);

	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-6 py-16">
			<div className="w-full max-w-sm">
				<div className="mb-8 text-center">
					<h1 className="font-bold text-2xl tracking-tight">
						{mode === "signin" ? "Welcome back" : "Create account"}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						{mode === "signin"
							? "Sign in to access cloud sync"
							: "Sync your library across devices"}
					</p>
				</div>

				<Tabs
					value={mode}
					onValueChange={(v) => {
						if (v === "signin" || v === "signup") setMode(v);
					}}
					className="mb-6"
				>
					<TabsList className="w-full">
						<TabsTrigger value="signin" className="flex-1">
							Sign in
						</TabsTrigger>
						<TabsTrigger value="signup" className="flex-1">
							Sign up
						</TabsTrigger>
					</TabsList>
				</Tabs>

				<AuthForm
					key={mode}
					mode={mode}
					redirectTo={redirectTo}
					hasExternalRedirect={hasExternalRedirect}
				/>

				<p className="mt-6 text-center text-muted-foreground text-xs">
					An account is optional - the app works fully offline without one.
				</p>
			</div>
		</div>
	);
}
