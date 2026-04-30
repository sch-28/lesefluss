import { createFileRoute } from "@tanstack/react-router";
import { Check, Mail, MessageSquareText, Send } from "lucide-react";
import * as React from "react";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/feedback/")({
	component: FeedbackPage,
	head: () =>
		seo({
			title: "Feedback - Lesefluss",
			description: "Send feedback, bug reports, and suggestions for the Lesefluss app and device.",
			path: "/feedback",
		}),
});

type SubmitState =
	| { kind: "idle" }
	| { kind: "submitting" }
	| { kind: "success" }
	| { kind: "error"; message: string };

function getSource(): string {
	if (typeof window === "undefined") return "website";
	return new URLSearchParams(window.location.search).get("source") || "website";
}

function FeedbackPage() {
	const [type, setType] = React.useState("suggestion");
	const [message, setMessage] = React.useState("");
	const [email, setEmail] = React.useState("");
	const [company, setCompany] = React.useState("");
	const [state, setState] = React.useState<SubmitState>({ kind: "idle" });

	async function submit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const trimmedMessage = message.trim();
		if (trimmedMessage.length < 10) {
			setState({ kind: "error", message: "Please share a little more detail before sending." });
			return;
		}

		setState({ kind: "submitting" });
		try {
			const res = await fetch("/api/feedback", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type,
					message: trimmedMessage,
					email: email.trim(),
					source: getSource(),
					company,
				}),
			});

			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				setState({ kind: "error", message: data.error ?? "Something went wrong. Try again." });
				return;
			}

			setState({ kind: "success" });
			setMessage("");
			setEmail("");
		} catch {
			setState({ kind: "error", message: "Network error. Try again." });
		}
	}

	const submitting = state.kind === "submitting";

	return (
		<div className="py-20">
			<section className="mx-auto grid max-w-5xl gap-10 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
				<div className="space-y-6">
					<div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-medium text-muted-foreground text-xs">
						<MessageSquareText className="size-3.5" />
						Feedback
					</div>
					<div className="space-y-4">
						<h1 className="font-bold text-4xl tracking-tight sm:text-5xl">Help shape Lesefluss</h1>
						<p className="max-w-xl text-lg text-muted-foreground leading-relaxed">
							Send suggestions, bug reports, or anything that would make Lesefluss better. A reply
							email is optional.
						</p>
					</div>
					<div className="rounded-2xl border border-border bg-muted/30 p-5 text-muted-foreground text-sm leading-relaxed">
						<p>
							Prefer email? Write directly to{" "}
							<a
								className="font-medium text-foreground underline-offset-4 hover:underline"
								href="mailto:feedback@lesefluss.app"
							>
								feedback@lesefluss.app
							</a>
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
							<h2 className="font-semibold text-2xl">Feedback sent</h2>
							<p className="mt-2 max-w-sm text-muted-foreground text-sm leading-relaxed">
								Thanks for taking the time. I read these directly and use them to plan improvements.
							</p>
							<button
								type="button"
								onClick={() => setState({ kind: "idle" })}
								className="mt-6 rounded-xl border border-border px-4 py-2 font-semibold text-sm transition-colors hover:bg-muted"
							>
								Send another note
							</button>
						</div>
					) : (
						<form onSubmit={submit} className="space-y-5">
							<div className="space-y-2">
								<label htmlFor="feedback-type" className="font-medium text-sm">
									What is this about?
								</label>
								<select
									id="feedback-type"
									value={type}
									onChange={(e) => setType(e.target.value)}
									disabled={submitting}
									className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-foreground/40"
								>
									<option value="suggestion">Suggestion</option>
									<option value="bug">Bug report</option>
									<option value="question">Question</option>
									<option value="other">Other</option>
								</select>
							</div>

							<div className="space-y-2">
								<label htmlFor="feedback-message" className="font-medium text-sm">
									Message
								</label>
								<textarea
									id="feedback-message"
									required
									minLength={10}
									maxLength={5000}
									rows={8}
									placeholder="Tell me what happened, what you expected, or what would make Lesefluss better."
									value={message}
									onChange={(e) => {
										setMessage(e.target.value);
										if (state.kind === "error") setState({ kind: "idle" });
									}}
									disabled={submitting}
									className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
								/>
								<p className="text-muted-foreground text-xs">{message.length}/5000 characters</p>
							</div>

							<div className="space-y-2">
								<label htmlFor="feedback-email" className="font-medium text-sm">
									Email <span className="font-normal text-muted-foreground">(optional)</span>
								</label>
								<input
									id="feedback-email"
									type="email"
									placeholder="you@example.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									disabled={submitting}
									className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
								/>
							</div>

							<div className="hidden" aria-hidden="true">
								<label htmlFor="company">Company</label>
								<input
									id="company"
									tabIndex={-1}
									autoComplete="off"
									value={company}
									onChange={(e) => setCompany(e.target.value)}
								/>
							</div>

							{state.kind === "error" && (
								<p className="text-destructive text-sm">{state.message}</p>
							)}

							<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<button
									type="submit"
									disabled={submitting}
									className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-3 font-semibold text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
								>
									<Send className="size-4" aria-hidden="true" />
									{submitting ? "Sending..." : "Send feedback"}
								</button>
								<a
									href="mailto:feedback@lesefluss.app"
									className="inline-flex items-center justify-center gap-2 text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
								>
									<Mail className="size-4" aria-hidden="true" />
									Use email instead
								</a>
							</div>
						</form>
					)}
				</div>
			</section>
		</div>
	);
}
