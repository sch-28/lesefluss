import { createFileRoute } from "@tanstack/react-router";
import {
	Bluetooth,
	BookMarked,
	BookOpen,
	Check,
	Globe,
	Highlighter,
	Library,
	Zap,
} from "lucide-react";
import * as React from "react";
import { FeatureCard } from "~/components/feature-card";
import { StatCard } from "~/components/stat-card";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/download/")({
	component: DownloadPage,
	head: () =>
		seo({
			title: "Download - Lesefluss",
			description:
				"Get the Lesefluss speed reading app for Android or open the web app. Import EPUB and TXT, read at up to 1000 WPM, fully offline.",
			path: "/download",
		}),
});

const features = [
	{
		icon: Library,
		title: "Book library",
		description: "Import EPUB and TXT. Metadata and chapters detected automatically.",
	},
	{
		icon: Zap,
		title: "RSVP reader",
		description: "Words flash at 100–1000 WPM with optimal letter alignment.",
	},
	{
		icon: BookOpen,
		title: "Built-in e-reader",
		description: "Dark and light themes. Adjustable font size, spacing, and margins.",
	},
	{
		icon: BookMarked,
		title: "Chapter navigation",
		description: "EPUB table of contents with one-tap chapter jumps.",
	},
	{
		icon: Highlighter,
		title: "Highlights and dictionary",
		description:
			"Long-press to highlight passages with color and notes. Tap a highlighted word for its dictionary definition. Search through the full book text.",
	},
	{
		icon: Globe,
		title: "Built-in library",
		description: "Browse and import from Project Gutenberg and Standard Ebooks. No account needed.",
	},
	{
		icon: Bluetooth,
		title: "Device sync",
		description: "Sync your book and reading position to the ESP32 device over Bluetooth.",
	},
];

const requirements = [
	{ label: "Platform", value: "Android 8.0+" },
	{ label: "Storage", value: "~30 MB + books" },
	{ label: "Permissions", value: "Bluetooth (optional)" },
];

function DownloadPage() {
	return (
		<div>
			{/* ── Hero ─────────────────────────────────────────────────── */}
			<section className="py-20">
				<div className="mx-auto max-w-5xl px-6">
					<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
						Android App
					</p>
					<h1 className="mb-5 font-bold text-4xl leading-tight sm:text-5xl">
						Lesefluss
						<br />
						<span className="text-muted-foreground">for Android</span>
					</h1>
					<p className="mb-10 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Import your own EPUB and TXT books, or pick from thousands of free classics on the
						built-in Explore page. Read at your own pace or push up to 1000 WPM with RSVP. No
						account required, fully offline.
					</p>
					<div className="flex flex-col items-start gap-3">
						<BetaAccessButton />
						<a
							href="https://github.com/sch-28/lesefluss/releases/latest"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline"
						>
							<svg
								viewBox="0 0 24 24"
								className="h-3.5 w-3.5 fill-none stroke-2 stroke-current"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
								/>
							</svg>
							Advanced: sideload APK from GitHub
						</a>
					</div>
				</div>
			</section>

			{/* ── Feature Grid ─────────────────────────────────────────── */}
			<section className="bg-muted/30 py-20">
				<div className="mx-auto max-w-5xl px-6">
					<h2 className="mb-12 font-bold text-2xl">Features</h2>
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{features.map((f) => (
							<FeatureCard key={f.title} {...f} />
						))}
					</div>
				</div>
			</section>

			{/* ── Requirements ─────────────────────────────────────────── */}
			<section className="py-20">
				<div className="mx-auto max-w-5xl px-6">
					<h2 className="mb-8 font-bold text-2xl">Requirements</h2>
					<div className="grid gap-4 sm:grid-cols-3">
						{requirements.map((r) => (
							<StatCard key={r.label} {...r} />
						))}
					</div>
					<p className="mt-6 text-muted-foreground text-sm">
						The app works entirely offline. An ESP32 device and cloud account are optional.
					</p>
				</div>
			</section>
		</div>
	);
}

type BetaState =
	| { kind: "idle" }
	| { kind: "submitting" }
	| { kind: "success" }
	| { kind: "error"; message: string };

function BetaAccessButton() {
	const [expanded, setExpanded] = React.useState(false);
	const [email, setEmail] = React.useState("");
	const [state, setState] = React.useState<BetaState>({ kind: "idle" });
	const inputRef = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => {
		if (expanded) inputRef.current?.focus();
	}, [expanded]);

	async function submit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const trimmed = email.trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
			setState({
				kind: "error",
				message: "Please enter a valid email address linked to a Google account.",
			});
			return;
		}
		setState({ kind: "submitting" });
		try {
			const res = await fetch("/api/beta-request", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: trimmed }),
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				setState({ kind: "error", message: data.error ?? "Something went wrong. Try again." });
				return;
			}
			setState({ kind: "success" });
		} catch {
			setState({ kind: "error", message: "Network error. Try again." });
		}
	}

	if (state.kind === "success") {
		return (
			<div className="inline-flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3">
				<div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
					<Check className="h-4 w-4" aria-hidden="true" />
				</div>
				<div className="text-left">
					<p className="text-[10px] text-muted-foreground">Request received</p>
					<p className="font-semibold text-sm">We&apos;ll add you within 24h</p>
				</div>
			</div>
		);
	}

	if (!expanded) {
		return (
			<button
				type="button"
				onClick={() => setExpanded(true)}
				className="relative inline-flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 transition-colors hover:border-foreground/30"
			>
				<svg viewBox="0 0 24 24" className="h-6 w-6 fill-foreground" aria-hidden="true">
					<path d="M3.18 23.76a2.5 2.5 0 0 1-1.18-2.2V2.44A2.5 2.5 0 0 1 3.18.24l11.4 11.76-11.4 11.76zM16.09 13.41l2.62 2.71-9.68 5.5 7.06-8.21zM20.13 9.7c.57.33.87.84.87 1.54 0 .62-.3 1.19-.87 1.52l-2.18 1.24-2.9-2.99 2.9-2.99 2.18 1.68zM9.03 2.38l9.68 5.5-2.62 2.71-7.06-8.21z" />
				</svg>
				<div className="text-left">
					<p className="text-[10px] text-muted-foreground">Request beta on</p>
					<p className="font-semibold text-sm">Google Play</p>
				</div>
			</button>
		);
	}

	const submitting = state.kind === "submitting";
	return (
		<form onSubmit={submit} className="flex flex-col gap-2">
			<div className="flex items-stretch gap-2 rounded-xl border border-border bg-card px-3 py-2">
				<input
					ref={inputRef}
					type="email"
					required
					placeholder="your Google-linked email"
					value={email}
					onChange={(e) => {
						setEmail(e.target.value);
						if (state.kind === "error") setState({ kind: "idle" });
					}}
					disabled={submitting}
					className="min-w-[200px] flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
				/>
				<button
					type="submit"
					disabled={submitting}
					className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{submitting ? "Sending…" : "Request access"}
				</button>
			</div>
			<p className="px-1 text-[11px] text-muted-foreground leading-snug">
				{state.kind === "error" ? (
					<span className="text-destructive">{state.message}</span>
				) : (
					"Use an email linked to a Google account — we'll add it to the closed Play Store test. No spam, just the tester invite."
				)}
			</p>
		</form>
	);
}
