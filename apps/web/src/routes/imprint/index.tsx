import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "~/components/legal-page";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/imprint/")({
	component: ImprintPage,
	head: () =>
		seo({
			title: "Imprint - Lesefluss",
			description: "Legal information about the operator of lesefluss.app under § 5 TMG.",
			path: "/imprint",
		}),
});

function ImprintPage() {
	return (
		<LegalPage title="Imprint" subtitle="Angaben gemäß § 5 TMG">
			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Operator</h2>
				<p>
					Jan Schmidt
					<br />
					c/o Autorenglück #45021
					<br />
					Albert-Einstein-Straße 47
					<br />
					02977 Hoyerswerda
					<br />
					Germany
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Contact</h2>
				<p>
					Email:{" "}
					<a
						href="mailto:contact@lesefluss.app"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						contact@lesefluss.app
					</a>
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Responsible for content</h2>
				<p>Responsible under § 18 (2) MStV: Jan Schmidt (address as above).</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Nature of the project</h2>
				<p>
					Lesefluss is a non-commercial open-source hobby project. The source code is available at{" "}
					<a
						href="https://github.com/sch-28/lesefluss"
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						github.com/sch-28/lesefluss
					</a>
					.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">EU dispute resolution</h2>
				<p>
					The European Commission provides a platform for online dispute resolution (ODR) at{" "}
					<a
						href="https://ec.europa.eu/consumers/odr"
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground underline decoration-border hover:decoration-foreground/50"
					>
						ec.europa.eu/consumers/odr
					</a>
					. We are not obliged and not willing to participate in a dispute resolution procedure
					before a consumer arbitration board.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Liability for content</h2>
				<p>
					As a service provider we are responsible for our own content on these pages according to §
					7 (1) TMG. Under §§ 8–10 TMG we are not obliged to monitor transmitted or stored
					third-party information or to investigate circumstances that indicate unlawful activity.
					Obligations to remove or block the use of information under general laws remain
					unaffected.
				</p>
			</section>

			<section>
				<h2 className="mb-3 font-semibold text-foreground text-xl">Liability for links</h2>
				<p>
					Our site contains links to external websites over whose content we have no control. We
					therefore cannot assume any liability for this external content. The respective provider
					or operator of the linked pages is always responsible for the content of the linked pages.
				</p>
			</section>
		</LegalPage>
	);
}
