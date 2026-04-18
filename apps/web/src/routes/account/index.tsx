import type { AnyFieldApi } from "@tanstack/react-form";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import { authClient } from "~/lib/auth-client";
import { getSession } from "~/lib/get-session";
import { clearCloudData } from "~/lib/profile";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/account/")({
	loader: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/login" });
		return { user: session.user };
	},
	head: () =>
		seo({
			title: "Account - Lesefluss",
			isNoindex: true,
		}),
	component: AccountPage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, "Required"),
		newPassword: z.string().min(8, "At least 8 characters"),
		confirmPassword: z.string().min(1, "Required"),
	})
	.refine((v) => v.newPassword === v.confirmPassword, {
		message: "Passwords don't match",
		path: ["confirmPassword"],
	});

function AccountSection({ email }: { email: string }) {
	const [showForm, setShowForm] = React.useState(false);
	const [success, setSuccess] = React.useState(false);
	const [serverError, setServerError] = React.useState<string | null>(null);

	const form = useForm({
		defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
		validators: { onSubmit: changePasswordSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			setSuccess(false);
			const result = await authClient.changePassword({
				currentPassword: value.currentPassword,
				newPassword: value.newPassword,
				revokeOtherSessions: false,
			});
			if (result.error) {
				setServerError(result.error.message ?? "Password change failed");
			} else {
				setSuccess(true);
				setShowForm(false);
				form.reset();
			}
		},
	});

	return (
		<section className="space-y-4">
			<h2 className="font-semibold text-base">Account</h2>
			<div className="flex items-center justify-between">
				<div>
					<span className="text-muted-foreground text-sm">Email</span>
					<p className="font-medium text-sm">{email}</p>
				</div>
				{!showForm && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setShowForm(true);
							setSuccess(false);
						}}
					>
						Change password
					</Button>
				)}
			</div>
			{showForm && (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
				>
					<FieldGroup className="gap-4">
						<form.Field name="currentPassword">
							{(field) => (
								<FormInput
									field={field}
									label="Current password"
									type="password"
									autoComplete="current-password"
								/>
							)}
						</form.Field>
						<form.Field name="newPassword">
							{(field) => (
								<FormInput
									field={field}
									label="New password"
									type="password"
									autoComplete="new-password"
								/>
							)}
						</form.Field>
						<form.Field name="confirmPassword">
							{(field) => (
								<FormInput
									field={field}
									label="Confirm new password"
									type="password"
									autoComplete="new-password"
								/>
							)}
						</form.Field>
					</FieldGroup>

					{serverError && (
						<p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-destructive text-sm">
							{serverError}
						</p>
					)}

					<div className="mt-4 flex gap-2">
						<form.Subscribe selector={(s) => s.isSubmitting}>
							{(isSubmitting) => (
								<Button type="submit" disabled={isSubmitting} size="sm">
									{isSubmitting ? "Saving…" : "Save password"}
								</Button>
							)}
						</form.Subscribe>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => {
								setShowForm(false);
								setServerError(null);
								form.reset();
							}}
						>
							Cancel
						</Button>
					</div>
				</form>
			)}
			{success && (
				<p className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-green-600 text-sm dark:text-green-400">
					Password changed successfully.
				</p>
			)}
		</section>
	);
}

type ConfirmState = "idle" | "confirming" | "loading";

function DangerZone() {
	const router = useRouter();
	const navigate = useNavigate();

	const [clearState, setClearState] = React.useState<ConfirmState>("idle");
	const [clearInput, setClearInput] = React.useState("");
	const [clearError, setClearError] = React.useState<string | null>(null);

	const [deleteState, setDeleteState] = React.useState<ConfirmState>("idle");
	const [deleteInput, setDeleteInput] = React.useState("");
	const [deletePassword, setDeletePassword] = React.useState("");
	const [deleteError, setDeleteError] = React.useState<string | null>(null);

	async function handleClear() {
		setClearState("loading");
		setClearError(null);
		try {
			await clearCloudData();
			setClearState("idle");
			setClearInput("");
			await router.invalidate();
		} catch {
			setClearError("Something went wrong. Please try again.");
			setClearState("confirming");
		}
	}

	async function handleDelete() {
		setDeleteState("loading");
		setDeleteError(null);
		try {
			const result = await authClient.deleteUser({ password: deletePassword });
			if (result.error) {
				setDeleteError(result.error.message ?? "Account deletion failed");
				setDeleteState("confirming");
			} else {
				navigate({ to: "/" });
			}
		} catch {
			setDeleteError("Something went wrong. Please try again.");
			setDeleteState("confirming");
		}
	}

	return (
		<section className="space-y-6">
			<h2 className="font-semibold text-base">Danger zone</h2>
			<div className="space-y-6 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
				<div className="space-y-3">
					<div>
						<p className="font-medium text-sm">Clear cloud data</p>
						<p className="mt-0.5 text-muted-foreground text-sm">
							Removes all synced books, highlights, and settings from the server. Your device data
							is unaffected.
						</p>
					</div>
					{clearState === "idle" && (
						<Button variant="outline" size="sm" onClick={() => setClearState("confirming")}>
							Clear cloud data
						</Button>
					)}
					{(clearState === "confirming" || clearState === "loading") && (
						<div className="space-y-3">
							<p className="text-muted-foreground text-sm">
								Type <strong>CLEAR</strong> to confirm.
							</p>
							<Input
								value={clearInput}
								onChange={(e) => setClearInput(e.target.value)}
								placeholder="CLEAR"
								className="max-w-48"
							/>
							{clearError && <p className="text-destructive text-sm">{clearError}</p>}
							<div className="flex gap-2">
								<Button
									variant="destructive"
									size="sm"
									disabled={clearInput !== "CLEAR" || clearState === "loading"}
									onClick={handleClear}
								>
									{clearState === "loading" ? "Clearing…" : "Confirm clear"}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setClearState("idle");
										setClearInput("");
										setClearError(null);
									}}
								>
									Cancel
								</Button>
							</div>
						</div>
					)}
				</div>

				<Separator className="bg-destructive/20" />

				<div className="space-y-3">
					<div>
						<p className="font-medium text-sm">Delete account</p>
						<p className="mt-0.5 text-muted-foreground text-sm">
							Permanently deletes your account and all cloud data. This cannot be undone.
						</p>
					</div>
					{deleteState === "idle" && (
						<Button
							variant="outline"
							size="sm"
							className="border-destructive/50 text-destructive hover:bg-destructive/10"
							onClick={() => setDeleteState("confirming")}
						>
							Delete account
						</Button>
					)}
					{(deleteState === "confirming" || deleteState === "loading") && (
						<div className="space-y-3">
							<p className="text-muted-foreground text-sm">
								Type <strong>DELETE</strong> and enter your password to confirm.
							</p>
							<Input
								value={deleteInput}
								onChange={(e) => setDeleteInput(e.target.value)}
								placeholder="DELETE"
								className="max-w-48"
							/>
							<Input
								type="password"
								value={deletePassword}
								onChange={(e) => setDeletePassword(e.target.value)}
								placeholder="Your password"
								autoComplete="current-password"
								className="max-w-48"
							/>
							{deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
							<div className="flex gap-2">
								<Button
									variant="destructive"
									size="sm"
									disabled={
										deleteInput !== "DELETE" ||
										deletePassword.length === 0 ||
										deleteState === "loading"
									}
									onClick={handleDelete}
								>
									{deleteState === "loading" ? "Deleting…" : "Delete my account"}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setDeleteState("idle");
										setDeleteInput("");
										setDeletePassword("");
										setDeleteError(null);
									}}
								>
									Cancel
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>
		</section>
	);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AccountPage() {
	const { user } = Route.useLoaderData();

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12">
			<h1 className="mb-10 font-bold text-3xl tracking-tight">Account</h1>
			<div className="space-y-10">
				<AccountSection email={user.email} />
				<Separator />
				<DangerZone />
			</div>
		</div>
	);
}
