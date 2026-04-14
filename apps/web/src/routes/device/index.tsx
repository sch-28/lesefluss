import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/device/')({
  component: DevicePage,
})

function DevicePage() {
  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="border-b border-zinc-800 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Open Source Hardware — Build Guide Free
          </p>
          <h1 className="mb-5 text-4xl font-bold leading-tight sm:text-5xl">
            The ESP32 Reader
          </h1>
          <p className="mb-8 max-w-xl text-lg text-zinc-400 leading-relaxed">
            A pocket-sized speed reader you build yourself. MicroPython firmware,
            single-button operation, and Bluetooth sync with the companion app.
            About €25 in parts.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/docs"
              className="rounded-lg bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white transition-colors"
            >
              View build guide →
            </Link>
            <a
              href="https://github.com/sch-28/rsvp"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-semibold text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
            >
              Source on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ── Variants ─────────────────────────────────────────────── */}
      <section className="border-b border-zinc-800 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-3 text-2xl font-bold">Two display variants</h2>
          <p className="mb-10 text-zinc-400">
            Both run the same firmware. Choose based on what you can source.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-8 ring-1 ring-zinc-600">
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-500">
                Recommended
              </p>
              <h3 className="mb-1 text-xl font-bold">AMOLED</h3>
              <p className="mb-1 text-sm text-zinc-500">RM67162 · 1.91" · 536×240</p>
              <p className="mb-6 mt-4 text-zinc-400 text-sm leading-relaxed">
                Deep blacks, excellent contrast in all lighting. The preferred
                variant for reading. Uses QSPI interface — requires the custom
                firmware build.
              </p>
              <ul className="space-y-2 text-sm text-zinc-400">
                {amoledPros.map((p) => (
                  <li key={p} className="flex items-center gap-2">
                    <span className="text-zinc-500">+</span> {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-500">
                Alternative
              </p>
              <h3 className="mb-1 text-xl font-bold">ST7789</h3>
              <p className="mb-1 text-sm text-zinc-500">TFT · 1.9" · 170×320</p>
              <p className="mb-6 mt-4 text-zinc-400 text-sm leading-relaxed">
                Easier to source and wire. Good for first builds. Slightly lower
                contrast than AMOLED but perfectly readable.
              </p>
              <ul className="space-y-2 text-sm text-zinc-400">
                {st7789Pros.map((p) => (
                  <li key={p} className="flex items-center gap-2">
                    <span className="text-zinc-500">+</span> {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Parts List ───────────────────────────────────────────── */}
      <section className="border-b border-zinc-800 bg-zinc-900/40 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-3 text-2xl font-bold">Parts list</h2>
          <p className="mb-8 text-zinc-400">
            Everything you need. Total cost is approximately €20–30 depending on where
            you source.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-500">
                  <th className="pb-3 font-medium pr-6">Part</th>
                  <th className="pb-3 font-medium pr-6">Notes</th>
                  <th className="pb-3 font-medium text-right">Est. cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {parts.map((part) => (
                  <tr key={part.name}>
                    <td className="py-3 pr-6 font-medium text-zinc-200">{part.name}</td>
                    <td className="py-3 pr-6 text-zinc-400">{part.notes}</td>
                    <td className="py-3 text-right text-zinc-400">{part.cost}</td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-700">
                  <td className="pt-4 pr-6 font-semibold">Total</td>
                  <td />
                  <td className="pt-4 text-right font-semibold">~€25</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-xs text-zinc-500">
            Sourced from AliExpress, LCSC, or your local electronics shop.
            Exact models and links are in the full build guide.
          </p>
        </div>
      </section>

      {/* ── Build Guide CTA ──────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-10">
            <h2 className="mb-3 text-2xl font-bold">Ready to build?</h2>
            <p className="mb-6 max-w-xl text-zinc-400 leading-relaxed">
              The full build guide walks through every step: sourcing parts, wiring
              the display, flashing the firmware, and pairing with the app. It's free.
              A donation to keep the project alive is always appreciated but never required.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/docs"
                className="rounded-lg bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white transition-colors"
              >
                Read the build guide →
              </Link>
              {/* TODO: replace with real Ko-fi/sponsor URL once set up */}
              <span
                aria-disabled="true"
                className="cursor-not-allowed rounded-lg border border-zinc-800 px-6 py-2.5 text-sm font-semibold text-zinc-600 opacity-60"
                title="Donation link coming soon"
              >
                Support on Ko-fi ☕
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

const amoledPros = [
  'True blacks, no backlight bleed',
  'Sharp contrast at all angles',
  'Lower power draw when displaying dark content',
]

const st7789Pros = [
  'Widely available, easy to source',
  'Standard SPI wiring, simpler setup',
  'Works with stock MicroPython firmware',
]

const parts = [
  { name: 'ESP32-S3 dev board', notes: 'e.g. Waveshare ESP32-S3-Zero', cost: '~€5' },
  { name: 'AMOLED display (RM67162)', notes: 'or ST7789 TFT as alternative', cost: '~€8' },
  { name: 'LiPo battery', notes: '300–500 mAh, JST-PH 2mm', cost: '~€4' },
  { name: 'LiPo charger / BMS', notes: 'TP4056 module', cost: '~€1' },
  { name: 'Tactile button', notes: '6×6mm or 12×12mm', cost: '<€1' },
  { name: 'Misc (wires, connectors)', notes: 'Jumpers, JST connectors, heat shrink', cost: '~€3' },
]
