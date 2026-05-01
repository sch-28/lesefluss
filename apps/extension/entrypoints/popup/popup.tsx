import {
	CheckCircle2,
	ExternalLink,
	FileText,
	Loader2,
	LogOut,
	Save,
	Sparkles,
	UserRound,
	XCircle,
} from "lucide-react";
import * as React from "react";
import { browser } from "wxt/browser";

import { Badge } from "../../src/components/ui/badge";
import { Button } from "../../src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../../src/components/ui/card";
import type { AuthSession } from "../../src/lib/auth";
import { LESEFLUSS_URL } from "../../src/lib/config";
import type {
	ArticleLookupResponse,
	BackgroundRequest,
	BackgroundResponse,
	SaveArticleResponse,
} from "../../src/lib/messages";

type Status =
	| { type: "idle" }
	| { type: "loading"; message: string }
	| { type: "success"; message: string }
	| { type: "error"; message: string };

type SavedBookState = SaveArticleResponse & { existing: boolean };

async function sendMessage<T>(message: BackgroundRequest): Promise<T> {
	const response = await browser.runtime.sendMessage(message);
	if (!isBackgroundResponse<T>(response)) throw new Error("Invalid extension response.");
	if (!response.ok) throw new Error(response.error);
	return response.data;
}

function isBackgroundResponse<T>(value: unknown): value is BackgroundResponse<T> {
	if (typeof value !== "object" || value === null || !("ok" in value)) return false;
	const response = value as { ok: unknown; data?: unknown; error?: unknown };
	if (response.ok === true) return "data" in response;
	return response.ok === false && typeof response.error === "string";
}

function StatusPanel({ status }: { status: Status }) {
	if (status.type === "idle") return null;

	const Icon =
		status.type === "loading" ? Loader2 : status.type === "success" ? CheckCircle2 : XCircle;
	const className =
		status.type === "success"
			? "border-primary/20 bg-primary/10 text-primary"
			: status.type === "error"
				? "border-destructive/20 bg-destructive/10 text-destructive"
				: "border-border bg-muted text-muted-foreground";

	return (
		<div className={`flex min-h-14 items-center gap-2 rounded-lg border p-3 text-sm ${className}`}>
			<Icon className={`mt-0.5 size-4 ${status.type === "loading" ? "animate-spin" : ""}`} />
			<p className="leading-snug">{status.message}</p>
		</div>
	);
}

export function Popup() {
	const [session, setSession] = React.useState<AuthSession | null>(null);
	const [savedBook, setSavedBook] = React.useState<SavedBookState | null>(null);
	const [status, setStatus] = React.useState<Status>({
		type: "idle",
	});

	React.useEffect(() => {
		let cancelled = false;
		sendMessage<AuthSession | null>({ type: "auth:get-session" })
			.then(async (nextSession) => {
				if (cancelled) return;
				setSession(nextSession);
				if (nextSession) {
					const existing = await sendMessage<ArticleLookupResponse>({
						type: "article:lookup-current-page",
					});
					if (cancelled) return;
					setSavedBook(existing ? { ...existing, existing: true } : null);
				}
				setStatus({ type: "idle" });
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setStatus({
					type: "error",
					message: error instanceof Error ? error.message : "Could not load the extension session.",
				});
			});

		return () => {
			cancelled = true;
		};
	}, []);

	async function handleSignIn() {
		setStatus({ type: "loading", message: "Opening secure sign-in..." });
		try {
			const nextSession = await sendMessage<AuthSession>({ type: "auth:sign-in" });
			setSession(nextSession);
			const existing = await sendMessage<ArticleLookupResponse>({
				type: "article:lookup-current-page",
			});
			setSavedBook(existing ? { ...existing, existing: true } : null);
			setStatus({
				type: existing ? "success" : "idle",
				message: existing ? "This page is already in your library." : "",
			});
		} catch (error) {
			setStatus({
				type: "error",
				message: error instanceof Error ? error.message : "Sign-in failed.",
			});
		}
	}

	async function handleSignOut() {
		setStatus({ type: "loading", message: "Signing out..." });
		try {
			await sendMessage<null>({ type: "auth:sign-out" });
			setSession(null);
			setSavedBook(null);
			setStatus({ type: "success", message: "Signed out from this browser." });
		} catch (error) {
			setStatus({
				type: "error",
				message: error instanceof Error ? error.message : "Sign-out failed.",
			});
		}
	}

	async function handleSavePage() {
		setSavedBook(null);
		setStatus({ type: "loading", message: "Capturing and importing this page..." });
		try {
			const saved = await sendMessage<SaveArticleResponse>({ type: "article:save-page" });
			setSavedBook({ ...saved, existing: true });
			setStatus({ type: "idle" });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Could not save this page.";
			setStatus({ type: "error", message });
			// Background clears the stored token on 401 — refresh local state so the
			// popup flips back to the sign-in button.
			try {
				const next = await sendMessage<AuthSession | null>({ type: "auth:get-session" });
				setSession(next);
			} catch {
				// Ignore — keep the original error visible.
			}
		}
	}

	async function handleOpenSavedBook() {
		if (!savedBook) return;
		await browser.tabs.create({
			url: `${LESEFLUSS_URL}/app/tabs/reader/${encodeURIComponent(savedBook.id)}`,
		});
	}

	function savedBookHost() {
		if (!savedBook) return null;
		try {
			return new URL(savedBook.url).hostname.replace(/^www\./, "");
		} catch {
			return null;
		}
	}

	const busy = status.type === "loading";

	return (
		<main className="relative w-95 overflow-hidden bg-background p-3 text-foreground">
			<div className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/8 blur-3xl" />
			<Card className="relative overflow-hidden border-0! border-none! bg-transparent! p-0! shadow-none! ring-0!">
				<CardHeader className="relative gap-3">
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2">
							<img alt="Lesefluss" className="size-5 shrink-0" src="/icon-48.png" />
							<div>
								<CardTitle>Lesefluss</CardTitle>
								<CardDescription>Save web articles to read later.</CardDescription>
							</div>
						</div>
						<Badge variant={session ? "default" : "secondary"}>
							{session ? "Connected" : "Signed out"}
						</Badge>
					</div>
				</CardHeader>
				<CardContent className="relative flex flex-col gap-2 overflow-hidden">
					{session ? (
						<div className="rounded-lg border bg-muted/40 p-4">
							<div className="flex items-center justify-between gap-2 text-sm">
								<div className="flex min-w-0 items-center gap-2">
									<UserRound className="size-4 shrink-0 text-primary" />
									<span className="truncate font-medium">{session.email ?? "Signed in"}</span>
								</div>
								<Button size="sm" variant="ghost" onClick={handleSignOut} disabled={busy}>
									<LogOut />
									Sign out
								</Button>
							</div>
							<p className="mt-1 text-muted-foreground text-xs">
								Articles are imported into your cloud library at{" "}
								{LESEFLUSS_URL.replace(/^https?:\/\//, "")}.
							</p>
						</div>
					) : (
						<div className="rounded-lg border bg-muted/40 p-3">
							<div className="flex items-center gap-2 text-sm">
								<Sparkles className="size-4 text-primary" />
								<span className="font-medium">Connect your Lesefluss account</span>
							</div>
							<p className="mt-1 text-muted-foreground text-xs">
								Sign in once, then save pages and selections from any tab.
							</p>
						</div>
					)}

					{savedBook ? (
						<div className="rounded-lg border bg-card/70 p-3 shadow-sm">
							<div className="flex items-start gap-2">
								<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
									<FileText className="size-4" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-sm">
										{savedBook.title || "Saved article"}
									</p>
									{savedBookHost() ? (
										<p className="truncate text-muted-foreground text-xs">{savedBookHost()}</p>
									) : null}
								</div>
								<Badge variant={savedBook.existing ? "secondary" : "default"}>
									{savedBook.existing ? "Already saved" : "Saved"}
								</Badge>
							</div>
							<Button
								className="mt-3 w-full"
								size="sm"
								variant="outline"
								onClick={handleOpenSavedBook}
								disabled={busy}
							>
								<ExternalLink />
								Read now
							</Button>
						</div>
					) : null}
					<StatusPanel status={status} />

					<div className="grid gap-2">
						{session ? (
							<Button size="lg" onClick={handleSavePage} disabled={busy}>
								{busy ? <Loader2 className="animate-spin" /> : <Save />}
								{savedBook?.existing ? "Rescan page" : "Save this page"}
							</Button>
						) : (
							<Button size="lg" onClick={handleSignIn} disabled={busy}>
								{busy ? null : <UserRound />}
								Sign in with Lesefluss
							</Button>
						)}
					</div>
				</CardContent>
			</Card>
		</main>
	);
}
