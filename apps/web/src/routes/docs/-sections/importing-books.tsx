import { BookMarked } from "lucide-react";
import type { DocsSection } from "./shared";

const linkClass = "text-foreground underline decoration-border hover:decoration-foreground/50";

function Content() {
	return (
		<div className="space-y-4 text-muted-foreground leading-relaxed">
			<p>
				You can only add DRM-free EPUBs or plain text files to Lesefluss. EPUB is recommended, since
				chapters, table of contents and metadata are extracted automatically.
			</p>

			<h4 className="font-semibold text-foreground">The Explore page</h4>
			<p className="text-sm">
				If you don't already have a book file lying around, open the{" "}
				<strong className="text-foreground">Explore</strong> tab in the app. It's integrated
				directly with{" "}
				<a
					href="https://www.gutenberg.org"
					target="_blank"
					rel="noopener noreferrer"
					className={linkClass}
				>
					Project Gutenberg
				</a>{" "}
				and{" "}
				<a
					href="https://standardebooks.org"
					target="_blank"
					rel="noopener noreferrer"
					className={linkClass}
				>
					Standard Ebooks
				</a>
				, so you can search, preview and add public-domain books with one tap.
			</p>

			<h4 className="font-semibold text-foreground">Importing your own files</h4>
			<ol className="list-inside list-decimal space-y-2 text-sm">
				<li>
					Tap <strong className="text-foreground">+</strong> on the Library screen.
				</li>
				<li>Pick an EPUB or TXT file from your device, or share one directly from another app.</li>
				<li>The app strips formatting and stores plain text so RSVP stays fast.</li>
			</ol>

			<p className="text-sm">
				Files stay on your device. If you're signed in, your library and reading progress sync
				across the app, the website and your ESP32 device automatically.
			</p>
		</div>
	);
}

export const importingBooksSection: DocsSection = {
	id: "importing-books",
	title: "Importing Books",
	icon: BookMarked,
	Content,
};
