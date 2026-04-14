import { createFileRoute, Link } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createFileRoute('/docs/')({
  component: DocsPage,
})

const troubleshootingItems = [
  {
    q: "The app can't find my ESP32 device",
    a: "Make sure Bluetooth is enabled on your phone and the device is powered on. BLE advertising stops during Wi-Fi mode — if the device's web UI is open, close it. Scan range is roughly 10 metres.",
  },
  {
    q: "Book upload fails or gets stuck",
    a: "Stay close to the device during transfer (within 1–2 m). The AMOLED firmware has smaller BLE buffers than ST7789 — if you're on AMOLED and seeing frequent failures, try reducing the transfer window in settings. This will be fixed in a future firmware update.",
  },
  {
    q: "EPUB import shows no chapters",
    a: "Some EPUB files use non-standard chapter structures. Try opening the file in Calibre and re-exporting as EPUB 3 with a proper table of contents.",
  },
  {
    q: "The device doesn't wake from sleep",
    a: "Press the physical button. Deep sleep is triggered after a configurable idle timeout. If the button doesn't respond, the battery may be depleted — charge via USB.",
  },
  {
    q: "Firmware upload fails with mpremote",
    a: "Make sure the device is in dev mode (create a file named 'devmode' on the flash). Try disconnecting and reconnecting USB, then re-running the upload script.",
  },
]

const sections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: '🚀',
    content: (
      <div className="space-y-4 text-zinc-400 leading-relaxed">
        <p>
          RSVP Reader is a free Android app for speed reading your book library. No
          account is required — download the APK or install from the Play Store and start
          importing books.
        </p>
        <h4 className="text-zinc-200 font-semibold">Install the app</h4>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>
            Download the latest APK from{' '}
            <a
              href="https://github.com/sch-28/rsvp/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 underline decoration-zinc-600 hover:decoration-zinc-400"
            >
              GitHub Releases
            </a>
            , or install from Google Play.
          </li>
          <li>Open the app — you'll land on the Library screen.</li>
          <li>
            Tap the <strong className="text-zinc-300">+</strong> button to import your first book.
          </li>
        </ol>
        <h4 className="text-zinc-200 font-semibold">First read</h4>
        <p className="text-sm">
          Tap a book to open it, then tap <strong className="text-zinc-300">RSVP</strong> in the
          toolbar to enter speed reading mode. Adjust WPM from the settings slider. The default
          is 350 WPM — a comfortable starting point.
        </p>
      </div>
    ),
  },
  {
    id: 'importing-books',
    title: 'Importing Books',
    icon: '📚',
    content: (
      <div className="space-y-4 text-zinc-400 leading-relaxed">
        <p>
          The app supports EPUB and plain TXT files. EPUB is recommended — chapters, TOC, and
          metadata are extracted automatically.
        </p>
        <h4 className="text-zinc-200 font-semibold">Where to get books</h4>
        <ul className="text-sm space-y-1.5">
          {[
            ['Project Gutenberg', 'gutenberg.org — 70 000+ public domain books, EPUB + TXT'],
            ['Standard Ebooks', 'standardebooks.org — beautifully formatted public domain EPUB'],
            ['Your own files', 'Any .epub or .txt file from your device storage'],
          ].map(([name, desc]) => (
            <li key={name} className="flex gap-2">
              <span className="text-zinc-600 shrink-0">—</span>
              <span>
                <strong className="text-zinc-300">{name}</strong> · {desc}
              </span>
            </li>
          ))}
        </ul>
        <h4 className="text-zinc-200 font-semibold">Import steps</h4>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>
            Tap <strong className="text-zinc-300">+</strong> on the Library screen.
          </li>
          <li>Browse to your file using the system picker, or share directly from another app.</li>
          <li>The app strips formatting and stores plain text for fast RSVP.</li>
        </ol>
      </div>
    ),
  },
  {
    id: 'esp32-build-guide',
    title: 'ESP32 Build Guide',
    icon: '🔧',
    content: (
      <div className="space-y-4 text-zinc-400 leading-relaxed">
        <p>
          The hardware device is optional. If you just want to read on your phone, skip this. If
          you want a dedicated pocket reader, here's what you need.
        </p>
        <h4 className="text-zinc-200 font-semibold">Parts</h4>
        <p className="text-sm">
          See the{' '}
          <Link
            to="/device"
            className="text-zinc-300 underline decoration-zinc-600 hover:decoration-zinc-400"
          >
            Device page
          </Link>{' '}
          for the full parts list and variant comparison (AMOLED vs ST7789). Total cost is
          approximately €25.
        </p>
        <h4 className="text-zinc-200 font-semibold">Wiring</h4>
        <p className="text-sm">
          Wiring diagram and pin mappings are coming soon. For now, refer to the source code in{' '}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
            apps/esp32/src/config.py
          </code>{' '}
          for GPIO pin assignments.
        </p>
        <h4 className="text-zinc-200 font-semibold">Flashing firmware</h4>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>
            Clone the repo:{' '}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
              git clone https://github.com/sch-28/rsvp
            </code>
          </li>
          <li>
            Navigate to{' '}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">apps/esp32/</code>
          </li>
          <li>
            Run{' '}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
              ./scripts/setup.sh --board AMOLED
            </code>{' '}
            (or{' '}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">ST7789</code>)
          </li>
          <li>The script flashes MicroPython firmware and uploads all source files.</li>
        </ol>
      </div>
    ),
  },
  {
    id: 'connecting-device',
    title: 'Connecting Your Device',
    icon: '📡',
    content: (
      <div className="space-y-4 text-zinc-400 leading-relaxed">
        <p>
          The app connects to your ESP32 reader over Bluetooth Low Energy (BLE). No pairing code
          or OS-level pairing is needed.
        </p>
        <h4 className="text-zinc-200 font-semibold">First connection</h4>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>Power on your ESP32 device. Make sure BLE is enabled in its settings.</li>
          <li>
            In the app, tap the <strong className="text-zinc-300">BLE</strong> badge in the tab
            bar.
          </li>
          <li>
            Tap <strong className="text-zinc-300">Scan</strong> — the device appears as{' '}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">RSVP-Reader</code>.
          </li>
          <li>Tap it to connect. Settings and position sync automatically.</li>
        </ol>
        <h4 className="text-zinc-200 font-semibold">Sending a book</h4>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>While connected, open a book in your Library.</li>
          <li>
            Tap <strong className="text-zinc-300">Send to device</strong>.
          </li>
          <li>The app uploads the book in BLE chunks. Progress is shown in a dialog.</li>
          <li>Once complete, the device auto-starts reading.</li>
        </ol>
        <p className="text-sm">
          Position is synced bidirectionally — reading on either device keeps them in step.
        </p>
      </div>
    ),
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    icon: '🛠️',
    content: (
      <div className="space-y-4 text-zinc-400 leading-relaxed">
        <div className="space-y-3">
          {troubleshootingItems.map((item) => (
            <details key={item.q} className="rounded-lg border border-zinc-800 bg-zinc-900/60">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-200 select-none">
                {item.q}
              </summary>
              <p className="border-t border-zinc-800 px-4 py-3 text-sm leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="text-sm pt-2">
          Still stuck?{' '}
          <a
            href="https://github.com/sch-28/rsvp/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-300 underline decoration-zinc-600 hover:decoration-zinc-400"
          >
            Open an issue on GitHub
          </a>
          .
        </p>
      </div>
    ),
  },
]

function DocsPage() {
  const [active, setActive] = React.useState(sections[0].id)
  const activeSection = sections.find((s) => s.id === active) ?? sections[0]

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10">
        <h1 className="mb-2 text-3xl font-bold">Documentation</h1>
        <p className="text-zinc-400">
          Guides for the app, the ESP32 device, and everything in between.
        </p>
      </div>
      <div className="flex gap-8 lg:gap-12">
        {/* Sidebar */}
        <aside className="hidden shrink-0 lg:block w-52">
          <nav className="sticky top-24 space-y-1">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  active === s.id
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <span className="mr-2">{s.icon}</span>
                {s.title}
              </button>
            ))}
          </nav>
        </aside>

        {/* Mobile nav */}
        <div className="lg:hidden w-full">
          <div className="mb-6 flex flex-wrap gap-2">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active === s.id
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {s.icon} {s.title}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <main className="min-w-0 flex-1">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8">
            <h2 className="mb-6 flex items-center gap-3 text-xl font-bold">
              <span>{activeSection.icon}</span>
              {activeSection.title}
            </h2>
            {activeSection.content}
          </div>
        </main>
      </div>
    </div>
  )
}
