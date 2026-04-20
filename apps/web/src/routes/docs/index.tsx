import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { seo } from "~/utils/seo";
import { faqPageSchema } from "~/utils/structured-data";
import { docsSections, troubleshootingItems } from "./-sections";

const SECTION_IDS = docsSections.map((s) => s.id);
type SectionId = string;

type DocsSearch = { tab?: SectionId };

export const Route = createFileRoute("/docs/")({
	component: DocsPage,
	validateSearch: (search: Record<string, unknown>): DocsSearch => {
		const tab = search.tab;
		return typeof tab === "string" && SECTION_IDS.includes(tab) ? { tab } : {};
	},
	head: () => ({
		...seo({
			title: "Docs - Lesefluss",
			description:
				"Getting started with Lesefluss: importing books, building the ESP32 reader, connecting your device, and troubleshooting.",
			path: "/docs",
		}),
		scripts: [faqPageSchema(troubleshootingItems)],
	}),
});

function DocsPage() {
	const { tab } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const active = tab ?? docsSections[0].id;
	const setActive = (value: string) => {
		navigate({
			search: value === docsSections[0].id ? {} : { tab: value },
			replace: true,
		});
	};

	return (
		<div className="mx-auto w-full max-w-5xl px-6 py-12">
			<div className="mb-10">
				<h1 className="mb-2 font-bold text-3xl">Documentation</h1>
				<p className="text-muted-foreground">
					Guides for the app, website and the ESP32 companion.
				</p>
			</div>

			<Tabs value={active} onValueChange={setActive} className="w-full">
				<div className="flex w-full gap-8 lg:gap-12">
					<aside className="hidden w-52 shrink-0 lg:block">
						<TabsList className="sticky top-24 h-auto w-full flex-col gap-1 bg-transparent p-0">
							{docsSections.map((s) => (
								<TabsTrigger
									key={s.id}
									value={s.id}
									className="w-full justify-start rounded-lg px-3 py-2 text-left text-sm data-[state=active]:bg-muted data-[state=inactive]:bg-transparent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:shadow-none data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground"
								>
									<s.icon className="mr-2 h-4 w-4 shrink-0" />
									{s.title}
								</TabsTrigger>
							))}
						</TabsList>
					</aside>

					<main className="min-w-0 flex-1">
						<div className="mb-6 flex flex-wrap gap-2 lg:hidden" role="tablist">
							{docsSections.map((s) => (
								<button
									key={s.id}
									type="button"
									role="tab"
									aria-selected={active === s.id}
									onClick={() => setActive(s.id)}
									className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-sm transition-colors ${
										active === s.id
											? "bg-muted text-foreground"
											: "border border-border bg-transparent text-muted-foreground hover:text-foreground"
									}`}
								>
									<s.icon className="h-3.5 w-3.5" />
									{s.title}
								</button>
							))}
						</div>

						{docsSections.map((s) => (
							<TabsContent
								key={s.id}
								value={s.id}
								className="mt-0 min-h-64 w-full rounded-xl border border-border bg-muted/20 p-8"
							>
								<h2 className="mb-6 flex items-center gap-3 font-bold text-xl">
									<s.icon className="h-5 w-5" />
									{s.title}
								</h2>
								<s.Content />
							</TabsContent>
						))}
					</main>
				</div>
			</Tabs>
		</div>
	);
}
