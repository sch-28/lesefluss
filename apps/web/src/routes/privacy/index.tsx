import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "~/components/legal-page";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/privacy/")({
	component: PrivacyPage,
	head: () =>
		seo({
			title: "Privacy — Lesefluss",
			description: "What data Lesefluss collects, how it's used, and how to delete it.",
			path: "/privacy",
		}),
});

function PrivacyPage() {
	return (
		<LegalPage title="Privacy" subtitle="Last updated: April 2026">
			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">TL;DR</h2>
				<p>
					Lesefluss is designed to collect as little as possible. The Android app works fully
					offline — no account needed. This website uses cookieless analytics and sets no tracking
					cookies. The only cookie you may receive is a login session cookie, and only if you sign
					in to use cloud sync.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">What this site collects</h2>
				<h3 className="mt-4 mb-2 font-medium text-foreground">Analytics (anonymous)</h3>
				<p>
					Pageviews are logged with a self-hosted{" "}
					<a
						href="https://umami.is"
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						Umami
					</a>{" "}
					instance running on our own server. No cookies are set, no personal data is stored, and
					data never leaves our infrastructure. Recorded fields: page URL, referrer, browser, OS,
					device type, country (derived from IP — the IP itself is never saved).
				</p>

				<h3 className="mt-6 mb-2 font-medium text-foreground">Session cookies</h3>
				<p>
					If you sign in (cloud sync), a session cookie is set by{" "}
					<a
						href="https://better-auth.com"
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						Better Auth
					</a>{" "}
					to keep you logged in. This cookie is strictly necessary to deliver the service you
					requested (authenticated access) and does not require consent under the ePrivacy Directive
					/ GDPR. It contains no tracking identifiers and is not shared with third parties.
				</p>

				<h3 className="mt-6 mb-2 font-medium text-foreground">Server logs</h3>
				<p>
					Our host may keep short-lived request logs (IP, timestamp, path) for security and abuse
					prevention. These are not correlated with accounts and are rotated out quickly.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">
					What we store when you sign in
				</h2>
				<p>Cloud sync is opt-in. When you create an account, we store:</p>
				<ul className="mt-3 space-y-2 text-sm">
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">—</span>
						<span>
							<strong className="text-foreground">Account</strong>: your email, a hashed password
							(or OAuth provider ID), and a display name.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">—</span>
						<span>
							<strong className="text-foreground">Books</strong>: title, author, plain-text content,
							cover image, chapter list, word count, and your reading position — everything the app
							needs to restore your library on a new device.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">—</span>
						<span>
							<strong className="text-foreground">Settings</strong>: RSVP and reader preferences
							(speed, theme, font, margins, etc.).
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">—</span>
						<span>
							<strong className="text-foreground">Highlights</strong>: the text ranges you
							highlight, their color, and optional notes.
						</span>
					</li>
				</ul>
				<p className="mt-4">
					Your data is stored on a server in the EU and is never sold, shared, or used to train
					models. Only you can read it.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">The Android app</h2>
				<p>
					The app runs fully offline by default. Books, settings, and highlights live in a local
					SQLite database on your device. Nothing leaves the device unless you explicitly sign in to
					sync. Bluetooth is used only to talk to the optional ESP32 device and transmits nothing to
					us.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Third parties</h2>
				<ul className="space-y-2 text-sm">
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">—</span>
						<span>
							<strong className="text-foreground">GitHub</strong> — if you download the APK or view
							the source, GitHub processes the request under its own privacy policy.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">—</span>
						<span>
							<strong className="text-foreground">Dictionary lookups</strong> — in-app word lookups
							query a public dictionary API directly from your device. No account or identifier is
							sent.
						</span>
					</li>
				</ul>
				<p className="mt-4">
					There are no advertising networks, no social-media pixels, no third-party analytics.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Your rights</h2>
				<p>
					Under GDPR you can request access to, correction of, or deletion of your personal data.
					For account data, you can delete your account from within the app to purge everything we
					have on you. For any other request, email{" "}
					<a
						href="mailto:privacy@lesefluss.app"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						privacy@lesefluss.app
					</a>
					.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Changes</h2>
				<p>
					If we change what the site or app collects, we'll update this page and note it at the top.
					For significant changes affecting existing users, we'll notify you in-app.
				</p>
			</section>
		</LegalPage>
	);
}
