import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

export const Route = createFileRoute("/device/")({
	component: DevicePage,
});

function DevicePage() {
	return (
		<div>
			{/* ── Hero ─────────────────────────────────────────────────── */}
			<section className="border-border border-b py-20">
				<div className="mx-auto max-w-5xl px-6">
					<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
						Open Source Hardware — Build Guide Free
					</p>
					<h1 className="mb-5 font-bold text-4xl leading-tight sm:text-5xl">The ESP32 Reader</h1>
					<p className="mb-8 max-w-xl text-lg text-muted-foreground leading-relaxed">
						A pocket-sized speed reader you build yourself. MicroPython firmware, single-button
						operation, and Bluetooth sync with the companion app. About €25 in parts.
					</p>
					<div className="flex flex-wrap gap-4">
						<Button asChild className="h-auto px-6 py-2.5 font-semibold text-sm">
							<Link to="/docs">View build guide →</Link>
						</Button>
						<Button asChild variant="outline" className="h-auto px-6 py-2.5 font-semibold text-sm">
							<a href="https://github.com/sch-28/rsvp" target="_blank" rel="noopener noreferrer">
								Source on GitHub
							</a>
						</Button>
					</div>
				</div>
			</section>

			{/* ── Variants ─────────────────────────────────────────────── */}
			<section className="border-border border-b py-20">
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
									Deep blacks, excellent contrast in all lighting. The preferred variant for
									reading. Uses QSPI interface — requires the custom firmware build.
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
									Easier to source and wire. Good for first builds. Slightly lower contrast than
									AMOLED but perfectly readable.
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
			<section className="border-border border-b bg-muted/20 py-20">
				<div className="mx-auto max-w-5xl px-6">
					<h2 className="mb-3 font-bold text-2xl">Parts list</h2>
					<p className="mb-8 text-muted-foreground">
						Everything you need. Total cost is approximately €20–30 depending on where you source.
					</p>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-border border-b text-left text-muted-foreground">
									<th className="pr-6 pb-3 font-medium">Part</th>
									<th className="pr-6 pb-3 font-medium">Notes</th>
									<th className="pb-3 text-right font-medium">Est. cost</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{parts.map((part) => (
									<tr key={part.name}>
										<td className="py-3 pr-6 font-medium">{part.name}</td>
										<td className="py-3 pr-6 text-muted-foreground">{part.notes}</td>
										<td className="py-3 text-right text-muted-foreground">{part.cost}</td>
									</tr>
								))}
								<tr className="border-border border-t">
									<td className="pt-4 pr-6 font-semibold">Total</td>
									<td />
									<td className="pt-4 text-right font-semibold">~€25</td>
								</tr>
							</tbody>
						</table>
					</div>
					<p className="mt-6 text-muted-foreground text-xs">
						Sourced from AliExpress, LCSC, or your local electronics shop. Exact models and links
						are in the full build guide.
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
								The full build guide walks through every step: sourcing parts, wiring the display,
								flashing the firmware, and pairing with the app. It's free. A donation to keep the
								project alive is always appreciated but never required.
							</p>
							<div className="flex flex-wrap gap-4">
								<Button asChild className="h-auto px-6 py-2.5 font-semibold text-sm">
									<Link to="/docs">Read the build guide →</Link>
								</Button>
								{/* TODO: replace with real Ko-fi/sponsor URL once set up */}
								<span
									aria-disabled="true"
									className="inline-flex h-auto cursor-not-allowed items-center rounded-lg border border-border px-6 py-2.5 font-semibold text-muted-foreground text-sm opacity-60"
									title="Donation link coming soon"
								>
									Support on Ko-fi ☕
								</span>
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
	"Lower power draw when displaying dark content",
];

const st7789Pros = [
	"Widely available, easy to source",
	"Standard SPI wiring, simpler setup",
	"Works with stock MicroPython firmware",
];

const parts = [
	{ name: "ESP32-S3 dev board", notes: "e.g. Waveshare ESP32-S3-Zero", cost: "~€5" },
	{ name: "AMOLED display (RM67162)", notes: "or ST7789 TFT as alternative", cost: "~€8" },
	{ name: "LiPo battery", notes: "300–500 mAh, JST-PH 2mm", cost: "~€4" },
	{ name: "LiPo charger / BMS", notes: "TP4056 module", cost: "~€1" },
	{ name: "Tactile button", notes: "6×6mm or 12×12mm", cost: "<€1" },
	{ name: "Misc (wires, connectors)", notes: "Jumpers, JST connectors, heat shrink", cost: "~€3" },
];
