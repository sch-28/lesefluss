import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "~/components/legal-page";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/terms/")({
	component: TermsPage,
	head: () =>
		seo({
			title: "Terms of Service — Lesefluss",
			description: "Terms governing your use of the Lesefluss website and cloud sync service.",
			path: "/terms",
		}),
});

function TermsPage() {
	return (
		<LegalPage title="Terms of Service" subtitle="Last updated: April 2026">
			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">About these terms</h2>
				<p>
					Lesefluss is a non-commercial open-source hobby project. These terms govern your use of
					the website at lesefluss.app and the optional cloud sync service. The Android app and
					ESP32 firmware are published under their repository's open-source license — these terms do
					not restrict your use of that code.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Accounts</h2>
				<p>
					You may create an account to enable cloud sync of your books, settings, and highlights
					across devices. You must provide a valid email address. You are responsible for keeping
					your credentials secure. One account per person; do not share accounts.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Acceptable use</h2>
				<p>Do not use the service to:</p>
				<ul className="mt-3 space-y-2 text-sm">
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">—</span>
						<span>Upload content you do not have the right to store.</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">—</span>
						<span>Abuse the sync endpoint (rate-limiting applies).</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">—</span>
						<span>
							Attempt to break, probe, or attack the service, or access accounts that are not yours.
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 text-muted-foreground/50">—</span>
						<span>Use the service in violation of applicable law.</span>
					</li>
				</ul>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Your content</h2>
				<p>
					You keep all rights to the books and highlights you upload. Storing them with us is solely
					to sync across your own devices. We do not access, share, sell, or use your content for
					any other purpose. See the{" "}
					<a
						href="/privacy"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						Privacy page
					</a>{" "}
					for details.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Service availability</h2>
				<p>
					The service is provided on a best-effort basis. There is no uptime guarantee, no SLA, and
					no support commitment. The service may change, be interrupted, or be discontinued at any
					time without notice. The Android app remains fully functional offline regardless of the
					state of this site.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Termination</h2>
				<p>
					You can delete your account at any time from within the app, which purges your data from
					our servers. We may suspend or terminate accounts that violate these terms or endanger the
					service.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Disclaimer and liability</h2>
				<p>
					The service is provided "as is" without warranty of any kind, express or implied,
					including but not limited to warranties of merchantability, fitness for a particular
					purpose, or non-infringement. To the extent permitted by law, we are not liable for any
					indirect, incidental, or consequential damages arising from your use of the service.
					Nothing in these terms limits liability that cannot be limited by German law.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Governing law</h2>
				<p>
					These terms are governed by German law. If any provision is unenforceable, the rest
					remains in effect.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Changes</h2>
				<p>
					We may update these terms. Significant changes affecting existing users will be announced
					in-app or by email. Continued use after changes constitutes acceptance.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Contact</h2>
				<p>
					Questions?{" "}
					<a
						href="mailto:contact@lesefluss.app"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						contact@lesefluss.app
					</a>
				</p>
			</section>
		</LegalPage>
	);
}
