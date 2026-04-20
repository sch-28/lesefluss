import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/device/")({
	component: DevicePage,
	head: () =>
		seo({
			title: "The ESP32 Reader - Lesefluss",
			description:
				"Build a pocket-sized speed reader for about €25. AMOLED or ST7789 display, single-button operation, Bluetooth sync with the app.",
			path: "/device",
		}),
});

function DevicePage() {
	return (
		<div>
			{/* ── Hero ─────────────────────────────────────────────────── */}
			<section className="py-20">
				<div className="mx-auto max-w-5xl px-6">
					<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
						DIY Hardware
					</p>
					<h1 className="mb-5 font-bold text-4xl leading-tight sm:text-5xl">The ESP32 Reader</h1>
					<p className="mb-8 max-w-xl text-lg text-muted-foreground leading-relaxed">
						A pocket-sized speed reader you build yourself. Single-button operation, Bluetooth sync
						with the app. About €25 in parts.
					</p>
					<div className="flex flex-wrap gap-4">
						<Button asChild className="h-auto px-6 py-2.5 font-semibold text-sm">
							<Link to="/docs" search={{ tab: "esp32-build-guide" }}>
								View build guide →
							</Link>
						</Button>
						<Button asChild variant="outline" className="h-auto px-6 py-2.5 font-semibold text-sm">
							<a
								href="https://github.com/sch-28/lesefluss"
								target="_blank"
								rel="noopener noreferrer"
							>
								Source on GitHub
							</a>
						</Button>
					</div>
				</div>
			</section>

			{/* ── Variants ─────────────────────────────────────────────── */}
			<section className="py-20">
				<div className="mx-auto max-w-5xl px-6">
					<h2 className="mb-3 font-bold text-2xl">Two display variants</h2>
					<p className="mb-10 text-muted-foreground">
						Both run the same firmware. Choose based on what you can source.
					</p>
					<div className="grid gap-6 sm:grid-cols-2">
						<Card className="gap-0 py-0 ring-2 ring-foreground/20">
							<CardContent className="p-8">
								<Badge variant="outline" className="mb-4">
									Recommended
								</Badge>
								<h3 className="mb-1 font-bold text-xl">AMOLED</h3>
								<p className="mb-1 text-muted-foreground text-sm">RM67162 · 1.91" · 536×240</p>
								<p className="mt-4 mb-6 text-muted-foreground text-sm leading-relaxed">
									Deep blacks, excellent contrast in all lighting and better performance. The
									preferred variant for reading.
								</p>
								<ul className="space-y-2 text-muted-foreground text-sm">
									{amoledPros.map((p) => (
										<li key={p} className="flex items-center gap-2">
											<span className="text-muted-foreground/60">+</span> {p}
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
						<Card className="gap-0 py-0">
							<CardContent className="p-8">
								<Badge variant="outline" className="mb-4">
									Alternative
								</Badge>
								<h3 className="mb-1 font-bold text-xl">ST7789</h3>
								<p className="mb-1 text-muted-foreground text-sm">TFT · 1.9" · 170×320</p>
								<p className="mt-4 mb-6 text-muted-foreground text-sm leading-relaxed">
									Cheaper. Slightly lower contrast than AMOLED but perfectly readable.
								</p>
								<ul className="space-y-2 text-muted-foreground text-sm">
									{st7789Pros.map((p) => (
										<li key={p} className="flex items-center gap-2">
											<span className="text-muted-foreground/60">+</span> {p}
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
					</div>
				</div>
			</section>

			{/* ── Parts List ───────────────────────────────────────────── */}
			<section className="bg-muted/30 py-20">
				<div className="mx-auto max-w-5xl px-6">
					<h2 className="mb-3 font-bold text-2xl">Parts list</h2>
					<p className="mb-8 text-muted-foreground">
						Two parts per build plus a 3D-printed case. Case files ship with the repo and print on
						any FDM printer in PLA.
					</p>

					<div className="grid gap-6 md:grid-cols-2">
						{variants.map((v) => (
							<Card key={v.name} className="gap-0 py-0">
								<CardContent className="p-6">
									<div className="mb-4 flex items-baseline justify-between">
										<h3 className="font-bold text-lg">{v.name}</h3>
										<span className="font-semibold text-sm">~€{v.total}</span>
									</div>
									<ul className="divide-y divide-border/60 text-sm">
										{v.parts.map((part) => (
											<li key={part.name} className="flex items-start justify-between gap-4 py-2.5">
												<div>
													<a
														href={part.href}
														target="_blank"
														rel="noopener noreferrer"
														className="font-medium text-foreground underline decoration-border hover:decoration-foreground/50"
													>
														{part.name}
													</a>
													<p className="text-muted-foreground text-xs leading-relaxed">
														{part.notes}
													</p>
												</div>
												<span className="shrink-0 text-muted-foreground">~€{part.cost}</span>
											</li>
										))}
										<li className="flex items-start justify-between gap-4 py-2.5">
											<div>
												<span className="font-medium text-foreground">3D-printed case</span>
												<p className="text-muted-foreground text-xs leading-relaxed">
													Body, cover and button. Files in the repo.
												</p>
											</div>
											<span className="shrink-0 text-muted-foreground">-</span>
										</li>
									</ul>
								</CardContent>
							</Card>
						))}
					</div>

					<p className="mt-6 text-muted-foreground text-xs">
						Exact product links, flashing and assembly are in the full build guide.
					</p>
				</div>
			</section>

			{/* ── Build Guide CTA ──────────────────────────────────────── */}
			<section className="py-20">
				<div className="mx-auto max-w-5xl px-6">
					<Card className="gap-0 py-0">
						<CardContent className="p-10">
							<h2 className="mb-3 font-bold text-2xl">Ready to build?</h2>
							<p className="mb-6 max-w-xl text-muted-foreground leading-relaxed">
								The build guide walks through every step: ordering parts, printing the case,
								flashing firmware, and assembly.
							</p>
							<div className="flex flex-wrap gap-4">
								<Button asChild className="h-auto px-6 py-2.5 font-semibold text-sm">
									<Link to="/docs" search={{ tab: "esp32-build-guide" }}>
										Read the build guide →
									</Link>
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			</section>
		</div>
	);
}

const amoledPros = [
	"True blacks, no backlight bleed",
	"Sharp contrast at all angles",
	"Better performance",
	"Lower power draw when displaying dark content",
];

const st7789Pros = [
	"Cheaper",
	"Bigger battery, longer runtime",
	"No custom JST soldering",
	"Works with stock MicroPython firmware",
	"Faster book transfers (larger BLE buffers)",
];

const variants = [
	{
		name: "AMOLED variant",
		total: 40,
		parts: [
			{
				name: "LilyGO T-Display-S3 AMOLED",
				notes: 'ESP32-S3 with 1.91" RM67162 AMOLED',
				href: "https://lilygo.cc/products/t-display-s3-amoled",
				cost: 30,
			},
			{
				name: "3.7V 500mAh LiPo (502248)",
				notes: "Needs a 1.25mm JST connector soldered on",
				href: "https://www.amazon.de/dp/B0F67DD4HK",
				cost: 10,
			},
		],
	},
	{
		name: "ST7789 variant",
		total: 25,
		parts: [
			{
				name: "ESP32-S3 board with ST7789 display",
				notes: 'Integrated 1.9" TFT, no soldering required',
				href: "https://www.amazon.de/dp/B0DWWB63YZ",
				cost: 15,
			},
			{
				name: "3.7V 1000mAh LiPo",
				notes: "Protection board and JST 1.25mm pre-attached",
				href: "https://www.amazon.de/-/en/YELUFT-Rechargeable-Protective-Development-Electronic/dp/B0F1CVPLZG",
				cost: 10,
			},
		],
	},
];
