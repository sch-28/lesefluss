import { type ChangelogTag, changelog } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "~/components/ui/badge";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/changelog/")({
	component: ChangelogPage,
	head: () =>
		seo({
			title: "Changelog - Lesefluss",
			description: "See what's new in Lesefluss - app, firmware, and website updates.",
			path: "/changelog",
		}),
});

const TAG_VARIANT: Record<ChangelogTag, "default" | "outline" | "secondary"> = {
	App: "default",
	ESP32: "outline",
	Website: "secondary",
};

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function ChangelogPage() {
	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
			<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
				What's new
			</p>
			<h1 className="mb-4 font-bold text-4xl leading-tight sm:text-5xl">Changelog</h1>
			<p className="mb-16 text-lg text-muted-foreground leading-relaxed">
				A running record of improvements to the app, firmware, and website.
			</p>

			<div className="relative">
				{/* Vertical river line */}
				<div className="absolute top-2 bottom-0 left-[7px] w-px bg-border" />

				<ol className="flex flex-col gap-12">
					{changelog.map((entry) => (
						<li key={entry.date} className="relative pl-8">
							{/* Dot */}
							<span className="absolute top-[6px] left-0 size-[15px] rounded-full border-2 border-background bg-primary ring-2 ring-primary/20" />

							{/* Date */}
							<p className="mb-1 text-muted-foreground text-sm">{formatDate(entry.date)}</p>

							{/* Title + tags */}
							<div className="mb-3 flex flex-wrap items-center gap-2">
								<h2 className="font-semibold text-xl">{entry.title}</h2>
								<div className="flex flex-wrap gap-1.5">
									{entry.tags.map((tag) => (
										<Badge key={tag} variant={TAG_VARIANT[tag]}>
											{tag}
										</Badge>
									))}
								</div>
							</div>

							{/* Changes */}
							<ul className="space-y-1.5">
								{entry.changes.map((change) => (
									<li
										key={change}
										className="flex gap-2 text-muted-foreground text-sm leading-relaxed"
									>
										<span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
										{change}
									</li>
								))}
							</ul>
						</li>
					))}
				</ol>
			</div>
		</div>
	);
}
