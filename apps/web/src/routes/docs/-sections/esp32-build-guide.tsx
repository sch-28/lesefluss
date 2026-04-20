import { Cpu } from "lucide-react";
import { type DocsSection, GITHUB_REPO } from "./shared";

function StepHeading({ step, title }: { step: number; title: string }) {
	return (
		<h3 className="mb-4 flex items-center gap-3 font-bold text-foreground text-lg">
			<span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/10 font-semibold text-foreground text-sm">
				{step}
			</span>
			{title}
		</h3>
	);
}

function StepSection({
	step,
	title,
	children,
}: {
	step: number;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section>
			<StepHeading step={step} title={title} />
			<div className="space-y-3 text-muted-foreground leading-relaxed">{children}</div>
		</section>
	);
}

const linkClass = "text-foreground underline decoration-border hover:decoration-foreground/50";

function Content() {
	return (
		<div className="space-y-8 text-muted-foreground leading-relaxed">
			<p>Lesefluss runs on two ESP32 variants:</p>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-lg border border-border bg-muted/20 p-4">
					<div className="mb-2 flex items-center gap-2">
						<strong className="text-foreground">AMOLED</strong>
						<span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] text-foreground uppercase tracking-wide">
							recommended
						</span>
					</div>
					<p className="text-sm">
						1.91" AMOLED display, richer contrast, smaller form factor and better performance. Costs
						a bit more and requires soldering a JST connector onto the battery if you want to use
						the same as I did.
					</p>
				</div>
				<div className="rounded-lg border border-border bg-muted/20 p-4">
					<div className="mb-2 flex items-center gap-2">
						<strong className="text-foreground">ST7789</strong>
						<span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] text-foreground uppercase tracking-wide">
							budget
						</span>
					</div>
					<p className="text-sm">
						ESP32-S3 dev board with an integrated ST7789 LCD. Cheaper and no soldering needed
						because we can use a bigger battery made for esp32 specifically.
					</p>
				</div>
			</div>

			<StepSection step={1} title="Ordering parts">
				<p className="text-sm">
					Pick a variant and order its board and battery. Case files are printed from the repo - see
					step 2.
				</p>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="rounded-lg border border-border bg-muted/20 p-4">
						<h4 className="mb-3 font-semibold text-foreground">AMOLED variant</h4>
						<ul className="space-y-2 text-sm">
							<li className="flex gap-2">
								<span className="shrink-0 text-muted-foreground/50">-</span>
								<span>
									<strong className="text-foreground">Board:</strong>{" "}
									<a
										href="https://lilygo.cc/products/t-display-s3-amoled"
										target="_blank"
										rel="noopener noreferrer"
										className={linkClass}
									>
										LilyGO T-Display-S3 AMOLED
									</a>{" "}
									(ESP32-S3, 1.91" AMOLED)
								</span>
							</li>
							<li className="flex gap-2">
								<span className="shrink-0 text-muted-foreground/50">-</span>
								<span>
									<strong className="text-foreground">Battery:</strong>{" "}
									<a
										href="https://www.amazon.de/dp/B0F67DD4HK"
										target="_blank"
										rel="noopener noreferrer"
										className={linkClass}
									>
										3.7 V 500 mAh LiPo, 50×22×5 mm (502248)
									</a>
									. Most come with a 2 mm JST connector - you'll need to solder on a 1.25 mm JST
									connector to fit the board.
								</span>
							</li>
						</ul>
					</div>

					<div className="rounded-lg border border-border bg-muted/20 p-4">
						<h4 className="mb-3 font-semibold text-foreground">ST7789 variant</h4>
						<ul className="space-y-2 text-sm">
							<li className="flex gap-2">
								<span className="shrink-0 text-muted-foreground/50">-</span>
								<span>
									<strong className="text-foreground">Board:</strong>{" "}
									<a
										href="https://www.amazon.de/dp/B0DWWB63YZ"
										target="_blank"
										rel="noopener noreferrer"
										className={linkClass}
									>
										ESP32-S3 with integrated ST7789 display
									</a>
								</span>
							</li>
							<li className="flex gap-2">
								<span className="shrink-0 text-muted-foreground/50">-</span>
								<span>
									<strong className="text-foreground">Battery:</strong>{" "}
									<a
										href="https://www.amazon.de/-/en/YELUFT-Rechargeable-Protective-Development-Electronic/dp/B0F1CVPLZG"
										target="_blank"
										rel="noopener noreferrer"
										className={linkClass}
									>
										3.7 V 1000 mAh LiPo, 44×26×12 mm
									</a>{" "}
									with protection board and JST 1.25 mm connector pre-attached
								</span>
							</li>
						</ul>
					</div>
				</div>
			</StepSection>

			<StepSection step={2} title="Printing the case">
				<p className="text-sm">
					Case files are 3MF - open in Bambu Studio, PrusaSlicer, or Orca. PLA works well at 0.2 mm
					layer height. Print body, cover, and button separately. Supports are not required.
				</p>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="rounded-lg border border-border bg-muted/20 p-4">
						<h4 className="mb-2 font-semibold text-foreground">AMOLED case (oled-v1)</h4>
						<div className="flex flex-wrap gap-2 text-sm">
							<a
								href={`${GITHUB_REPO}/raw/main/resources/case/oled-v1/body.3mf`}
								target="_blank"
								rel="noopener noreferrer"
								className={linkClass}
							>
								body.3mf
							</a>
							<span className="text-muted-foreground/50">·</span>
							<a
								href={`${GITHUB_REPO}/raw/main/resources/case/oled-v1/cover.3mf`}
								target="_blank"
								rel="noopener noreferrer"
								className={linkClass}
							>
								cover.3mf
							</a>
							<span className="text-muted-foreground/50">·</span>
							<a
								href={`${GITHUB_REPO}/raw/main/resources/case/oled-v1/button.3mf`}
								target="_blank"
								rel="noopener noreferrer"
								className={linkClass}
							>
								button.3mf
							</a>
						</div>
					</div>
					<div className="rounded-lg border border-border bg-muted/20 p-4">
						<h4 className="mb-2 font-semibold text-foreground">ST7789 case (base-v1)</h4>
						<div className="flex flex-wrap gap-2 text-sm">
							<a
								href={`${GITHUB_REPO}/raw/main/resources/case/base-v1/body.3mf`}
								target="_blank"
								rel="noopener noreferrer"
								className={linkClass}
							>
								body.3mf
							</a>
							<span className="text-muted-foreground/50">·</span>
							<a
								href={`${GITHUB_REPO}/raw/main/resources/case/base-v1/cover.3mf`}
								target="_blank"
								rel="noopener noreferrer"
								className={linkClass}
							>
								cover.3mf
							</a>
							<span className="text-muted-foreground/50">·</span>
							<a
								href={`${GITHUB_REPO}/raw/main/resources/case/base-v1/button.3mf`}
								target="_blank"
								rel="noopener noreferrer"
								className={linkClass}
							>
								button.3mf
							</a>
						</div>
					</div>
				</div>
			</StepSection>

			<StepSection step={3} title="Flashing the firmware">
				<p className="text-sm">
					The <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">setup.sh</code>{" "}
					script erases flash, writes MicroPython, and uploads the Lesefluss code in one go.
				</p>
				<ol className="list-inside list-decimal space-y-2 text-sm">
					<li>
						Clone the repo:{" "}
						<code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
							git clone {GITHUB_REPO}
						</code>
					</li>
					<li>
						Make sure you have <strong className="text-foreground">Python 3</strong> installed and
						connect the board via USB-C.
					</li>
					<li>
						Both firmware binaries ship in{" "}
						<code className="rounded bg-muted px-1.5 py-0.5 text-foreground">apps/esp32/etc/</code>{" "}
						- the AMOLED build comes from{" "}
						<a
							href="https://github.com/nspsck/RM67162_Micropython_QSPI"
							target="_blank"
							rel="noopener noreferrer"
							className={linkClass}
						>
							nspsck/RM67162_Micropython_QSPI
						</a>{" "}
						(upstream MicroPython build for ESP32-S3 + RM67162). No manual download needed.
					</li>
					<li>
						From <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">apps/esp32</code>,
						run:
						<pre className="my-2 overflow-x-auto rounded-lg border border-border bg-muted p-3 text-foreground text-xs">
							<code>./scripts/setup.sh --board AMOLED</code>
						</pre>
						or
						<pre className="my-2 overflow-x-auto rounded-lg border border-border bg-muted p-3 text-foreground text-xs">
							<code>./scripts/setup.sh --board ST7789</code>
						</pre>
						The script creates a Python venv, installs <code>esptool</code> + <code>mpremote</code>,
						flashes firmware, and uploads the app.
					</li>
					<li>
						Then you have to make sure the Dev mode is disabled, to do that run:
						<pre className="my-2 overflow-x-auto rounded-lg border border-border bg-muted p-3 text-foreground text-xs">
							<code>./scripts/run.sh --board AMOLED</code>
						</pre>
						or
						<pre className="my-2 overflow-x-auto rounded-lg border border-border bg-muted p-3 text-foreground text-xs">
							<code>./scripts/run.sh --board ST7789</code>
						</pre>
						Open the lesefluss app, device settings, connect, disable the Dev mode and sync it to
						the esp32.
					</li>
				</ol>
			</StepSection>

			<StepSection step={4} title="Assembly">
				<ol className="list-inside list-decimal space-y-2 text-sm">
					<li>Gather the printed case parts (body, cover, button) for your variant.</li>
					<li>
						<strong className="text-foreground">AMOLED only:</strong> solder a 1.25 mm JST connector
						onto the battery wires and make sure the polarity is correct!
					</li>
					<li>Plug the battery into the board's JST socket.</li>
					<li>Fit the board into the case body, seat the button, and close with the cover.</li>
				</ol>
			</StepSection>
		</div>
	);
}

export const esp32BuildGuideSection: DocsSection = {
	id: "esp32-build-guide",
	title: "ESP32 Build Guide",
	icon: Cpu,
	Content,
};
