import {
	NOTICE_REASON_LABELS,
	NOTICE_REASONS,
	NOTICE_TARGET_TYPES,
	NOTICE_TEXT_MAX_LENGTH,
	type NoticeReason,
	type NoticeTargetType,
} from "@lesefluss/core";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ShieldAlert } from "lucide-react";
import * as React from "react";
import { NOTICE_TARGET_LABELS } from "~/lib/moderation/web-form";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/report/")({
	component: ReportPage,
	head: () =>
		seo({
			title: "Report content - Lesefluss",
			description:
				"Notify Lesefluss of illegal content or a violation of our terms on a user's profile or in a shared book.",
			path: "/report",
		}),
});

type SubmitState =
	| { kind: "idle" }
	| { kind: "submitting" }
	| { kind: "success"; id: string }
	| { kind: "error"; message: string; fields: Record<string, string> };

const inputClass =
	"w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-foreground/40";

function Field({
	id,
	label,
	error,
	children,
}: {
	id: string;
	label: React.ReactNode;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<label htmlFor={id} className="font-medium text-sm">
				{label}
			</label>
			{children}
			{error && (
				<p className="text-destructive text-xs" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}

function ReportPage() {
	const [targetType, setTargetType] = React.useState<NoticeTargetType>("profile");
	const [location, setLocation] = React.useState("");
	const [reason, setReason] = React.useState<NoticeReason>("copyright");
	const [text, setText] = React.useState("");
	const [name, setName] = React.useState("");
	const [email, setEmail] = React.useState("");
	const [goodFaith, setGoodFaith] = React.useState(false);
	const [company, setCompany] = React.useState("");
	const [state, setState] = React.useState<SubmitState>({ kind: "idle" });

	const fields = state.kind === "error" ? state.fields : {};
	const submitting = state.kind === "submitting";

	async function submit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setState({ kind: "submitting" });
		try {
			const res = await fetch("/api/report", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					targetType,
					location,
					reason,
					text,
					name,
					email,
					goodFaith,
					company,
				}),
			});
			const data = (await res.json().catch(() => ({}))) as {
				error?: string;
				fields?: Record<string, string>;
				id?: string;
			};
			if (!res.ok) {
				setState({
					kind: "error",
					message: data.error ?? "Something went wrong. Please try again.",
					fields: data.fields ?? {},
				});
				return;
			}
			setState({ kind: "success", id: data.id ?? "" });
		} catch {
			setState({ kind: "error", message: "Network error. Please try again.", fields: {} });
		}
	}

	return (
		<div className="py-20">
			<section className="mx-auto grid max-w-5xl gap-10 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
				<div className="space-y-6">
					<div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-medium text-muted-foreground text-xs">
						<ShieldAlert className="size-3.5" />
						Notice
					</div>
					<div className="space-y-4">
						<h1 className="font-bold text-4xl tracking-tight sm:text-5xl">Report content</h1>
						<p className="max-w-xl text-lg text-muted-foreground leading-relaxed">
							Tell us about a profile or a shared book on Lesefluss that you believe is illegal or
							breaks our{" "}
							<Link to="/terms" className="text-foreground underline underline-offset-4">
								terms
							</Link>
							. You do not need an account. We review every notice, act where warranted, and tell
							you what we decided.
						</p>
					</div>
					<div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-5 text-muted-foreground text-sm leading-relaxed">
						<p>
							This is our notice and action mechanism under Article 16 of the EU Digital Services
							Act. Authorities and rightsholders can also write to{" "}
							<a
								className="font-medium text-foreground underline-offset-4 hover:underline"
								href="mailto:notices@lesefluss.app"
							>
								notices@lesefluss.app
							</a>
							.
						</p>
						<p>
							The person you report is never told who notified us. Your name and email are kept with
							the notice for 24 months after our decision; see the{" "}
							<Link to="/privacy" className="text-foreground underline underline-offset-4">
								privacy page
							</Link>
							.
						</p>
					</div>
				</div>

				<div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
					{state.kind === "success" ? (
						<div className="flex min-h-[360px] flex-col items-center justify-center text-center">
							<div className="mb-5 flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
								<Check className="size-6" aria-hidden="true" />
							</div>
							<h2 className="font-semibold text-2xl">Notice received</h2>
							<p className="mt-2 max-w-sm text-muted-foreground text-sm leading-relaxed">
								Thank you. We sent a confirmation to your email and will let you know our decision
								there.
							</p>
							{state.id && (
								<p className="mt-3 text-muted-foreground text-xs">
									Reference: <code>{state.id}</code>
								</p>
							)}
						</div>
					) : (
						<form onSubmit={submit} className="space-y-5" noValidate>
							<Field id="report-target" label="What are you reporting?">
								<select
									id="report-target"
									value={targetType}
									onChange={(e) => {
										setTargetType(e.target.value as NoticeTargetType);
										setLocation("");
									}}
									disabled={submitting}
									className={inputClass}
								>
									{NOTICE_TARGET_TYPES.map((t) => (
										<option key={t} value={t}>
											{NOTICE_TARGET_LABELS[t].label}
										</option>
									))}
								</select>
							</Field>

							<Field id="report-location" label="Where is it?" error={fields.location}>
								<input
									id="report-location"
									value={location}
									onChange={(e) => setLocation(e.target.value)}
									aria-describedby="report-location-hint"
									disabled={submitting}
									className={inputClass}
								/>
								<p id="report-location-hint" className="text-muted-foreground text-xs">
									{NOTICE_TARGET_LABELS[targetType].hint}
								</p>
							</Field>

							<Field id="report-reason" label="Reason" error={fields.reason}>
								<select
									id="report-reason"
									value={reason}
									onChange={(e) => setReason(e.target.value as NoticeReason)}
									disabled={submitting}
									className={inputClass}
								>
									{NOTICE_REASONS.map((r) => (
										<option key={r} value={r}>
											{NOTICE_REASON_LABELS[r]}
										</option>
									))}
								</select>
							</Field>

							<Field
								id="report-text"
								label={
									<>
										Why is it illegal or against the terms?{" "}
										<span className="font-normal text-muted-foreground">
											({text.length}/{NOTICE_TEXT_MAX_LENGTH})
										</span>
									</>
								}
								error={fields.text}
							>
								<textarea
									id="report-text"
									value={text}
									onChange={(e) => setText(e.target.value.slice(0, NOTICE_TEXT_MAX_LENGTH))}
									rows={6}
									disabled={submitting}
									placeholder="For copyright: which work, and why you hold or represent the rights."
									className={inputClass}
								/>
							</Field>

							<div className="grid gap-5 sm:grid-cols-2">
								<Field id="report-name" label="Your name" error={fields.name}>
									<input
										id="report-name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										disabled={submitting}
										className={inputClass}
									/>
								</Field>
								<Field id="report-email" label="Your email" error={fields.email}>
									<input
										id="report-email"
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										disabled={submitting}
										className={inputClass}
									/>
								</Field>
							</div>

							<div className="space-y-2">
								<label className="flex items-start gap-3 text-sm">
									<input
										type="checkbox"
										checked={goodFaith}
										onChange={(e) => setGoodFaith(e.target.checked)}
										disabled={submitting}
										aria-invalid={Boolean(fields.goodFaith)}
										aria-describedby={fields.goodFaith ? "report-good-faith-error" : undefined}
										className="mt-1"
									/>
									<span>
										I confirm in good faith that the information in this notice is accurate and
										complete.
									</span>
								</label>
								{fields.goodFaith && (
									<p id="report-good-faith-error" className="text-destructive text-xs" role="alert">
										{fields.goodFaith}
									</p>
								)}
							</div>

							<div className="hidden" aria-hidden="true">
								<label htmlFor="report-company">Company</label>
								<input
									id="report-company"
									tabIndex={-1}
									autoComplete="off"
									value={company}
									onChange={(e) => setCompany(e.target.value)}
								/>
							</div>

							{state.kind === "error" && (
								<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
									{state.message}
								</p>
							)}

							<button
								type="submit"
								disabled={submitting}
								className="w-full rounded-xl bg-foreground px-4 py-2.5 font-semibold text-background text-sm transition-opacity disabled:opacity-60"
							>
								{submitting ? "Sending…" : "Send notice"}
							</button>
						</form>
					)}
				</div>
			</section>
		</div>
	);
}
