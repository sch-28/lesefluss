import { Button } from "@lesefluss/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@lesefluss/ui/field";
import { Input } from "@lesefluss/ui/input";
import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { authClient } from "~/lib/auth-client";
import { seo } from "~/utils/seo";

const MIN_PASSWORD_LENGTH = 8;

/** better-auth redirects the mail's link here with `?token=` or, when it expired, `?error=INVALID_TOKEN`. */
export function validateResetSearch(search: Record<string, unknown>): {
	token?: string;
	error?: string;
} {
	return {
		token: typeof search.token === "string" && search.token !== "" ? search.token : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	};
}

export const Route = createFileRoute("/reset-password/")({
	validateSearch: validateResetSearch,
	component: ResetPasswordPage,
	head: () => {
		const { meta, ...rest } = seo({
			title: "Reset password - Lesefluss",
			path: "/reset-password",
			isNoindex: true,
		});
		// The token sits in the URL; no link on this page may hand it on.
		return { ...rest, meta: [...meta, { name: "referrer", content: "no-referrer" }] };
	},
});

function ResetPasswordPage() {
	const { token, error } = Route.useSearch();
	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-6 py-16">
			<div className="w-full max-w-sm">
				{token ? <NewPasswordForm token={token} /> : <RequestResetForm isExpired={!!error} />}
			</div>
		</div>
	);
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
	return (
		<div className="mb-8 text-center">
			<h1 className="font-bold text-2xl tracking-tight">{title}</h1>
			<p className="mt-2 text-muted-foreground text-sm">{subtitle}</p>
		</div>
	);
}

function RequestResetForm({ isExpired }: { isExpired: boolean }) {
	const [email, setEmail] = React.useState("");
	const [status, setStatus] = React.useState<"idle" | "sending" | "sent">("idle");
	const [serverError, setServerError] = React.useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (email.trim() === "") return;
		setStatus("sending");
		setServerError(null);
		const { error } = await authClient.requestPasswordReset({
			email: email.trim(),
			redirectTo: "/reset-password",
		});
		if (error) {
			setServerError(error.message ?? "Couldn't send the reset link. Try again later.");
			setStatus("idle");
			return;
		}
		setStatus("sent");
	};

	return (
		<>
			<Heading
				title="Forgot your password?"
				subtitle={
					isExpired
						? "That link has expired or was already used. Ask for a new one."
						: "We'll email you a link to set a new one."
				}
			/>
			{status === "sent" ? (
				<p role="status" className="rounded-lg border border-border bg-card px-5 py-6 text-sm">
					If <span className="font-medium">{email.trim()}</span> has an account, a link to set a new
					password is on its way. Check your spam folder if it doesn't arrive.
				</p>
			) : (
				<form onSubmit={handleSubmit}>
					<FieldGroup className="gap-4">
						<Field>
							<FieldLabel htmlFor="reset-email">Email</FieldLabel>
							<Input
								id="reset-email"
								type="email"
								autoComplete="email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</Field>
					</FieldGroup>
					{serverError && <FieldError className="mt-4">{serverError}</FieldError>}
					<Button
						type="submit"
						size="lg"
						className="mt-6 w-full"
						disabled={status === "sending" || email.trim() === ""}
					>
						{status === "sending" ? "Sending…" : "Send reset link"}
					</Button>
				</form>
			)}
			<p className="mt-6 text-center text-sm">
				<Link to="/login" className="text-muted-foreground underline underline-offset-4">
					Back to sign in
				</Link>
			</p>
		</>
	);
}

function NewPasswordForm({ token }: { token: string }) {
	const [password, setPassword] = React.useState("");
	const [confirm, setConfirm] = React.useState("");
	const [status, setStatus] = React.useState<"idle" | "saving" | "done">("idle");
	const [formError, setFormError] = React.useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (password.length < MIN_PASSWORD_LENGTH) {
			setFormError(`At least ${MIN_PASSWORD_LENGTH} characters`);
			return;
		}
		if (password !== confirm) {
			setFormError("The passwords don't match");
			return;
		}
		setStatus("saving");
		setFormError(null);
		const { error } = await authClient.resetPassword({ newPassword: password, token });
		if (error) {
			setFormError(
				error.code === "INVALID_TOKEN"
					? "That link has expired or was already used. Ask for a new one."
					: (error.message ?? "Couldn't set the new password. Try again."),
			);
			setStatus("idle");
			return;
		}
		setStatus("done");
	};

	if (status === "done") {
		return (
			<>
				<Heading
					title="Password changed"
					subtitle="Sign in with your new password, here or in the app."
				/>
				<Button asChild size="lg" className="w-full">
					<Link to="/login">Sign in</Link>
				</Button>
			</>
		);
	}

	return (
		<>
			<Heading title="Set a new password" subtitle="Choose a password of at least 8 characters." />
			<form onSubmit={handleSubmit}>
				<FieldGroup className="gap-4">
					<Field>
						<FieldLabel htmlFor="reset-password">New password</FieldLabel>
						<Input
							id="reset-password"
							type="password"
							autoComplete="new-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="reset-confirm">Repeat new password</FieldLabel>
						<Input
							id="reset-confirm"
							type="password"
							autoComplete="new-password"
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
						/>
					</Field>
				</FieldGroup>
				{formError && <FieldError className="mt-4">{formError}</FieldError>}
				<Button type="submit" size="lg" className="mt-6 w-full" disabled={status === "saving"}>
					{status === "saving" ? "Saving…" : "Set new password"}
				</Button>
			</form>
			<p className="mt-6 text-center text-sm">
				<Link to="/reset-password" className="text-muted-foreground underline underline-offset-4">
					Ask for a new link
				</Link>
			</p>
		</>
	);
}
