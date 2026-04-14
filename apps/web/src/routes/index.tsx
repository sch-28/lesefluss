import { createFileRoute, Link } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createFileRoute('/')({
  component: Home,
})

const handleVideoEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
  e.currentTarget.pause()
}

function Home() {
  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden">
        <video
          src="/landing.mp4"
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
          onEnded={handleVideoEnded}
        />
        <div className="absolute inset-0 bg-zinc-950/65" />
        <div className="relative mx-auto max-w-5xl px-6 py-44 text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-400">
            Rapid Serial Visual Presentation
          </p>
          <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl">
            Read faster.
            <br />
            <span className="text-zinc-300">One word at a time.</span>
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-lg text-zinc-300">
            A free, open-source speed reading app for Android. Import any book,
            read at 350+ WPM, and optionally sync to a pocket-sized ESP32 device
            for screen-free reading.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/app"
              className="rounded-lg bg-zinc-100 px-8 py-3 font-semibold text-zinc-900 hover:bg-white transition-colors"
            >
              Get the app
            </Link>
            <Link
              to="/device"
              className="rounded-lg border border-zinc-400 px-8 py-3 font-semibold text-zinc-200 hover:border-white hover:text-white transition-colors"
            >
              Build the device
            </Link>
          </div>
        </div>
      </section>

      {/* ── App Section ──────────────────────────────────────────── */}
      <section className="border-t border-zinc-800 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Android App — Free
              </p>
              <h2 className="mb-5 text-3xl font-bold leading-tight">
                A complete reading experience,
                <br />
                no hardware required
              </h2>
              <p className="mb-8 text-zinc-400 leading-relaxed">
                The RSVP Reader app works fully standalone. Manage your library,
                read EPUB and TXT books with the built-in reader, or switch to
                RSVP mode and blaze through chapters at 300–600 WPM.
              </p>
              <ul className="mb-8 space-y-3">
                {appFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-zinc-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/app"
                  className="rounded-lg bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white transition-colors"
                >
                  Download the app
                </Link>
                <Link
                  to="/docs"
                  className="rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-semibold text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
                >
                  Getting started →
                </Link>
              </div>
            </div>
            {/* Stylised app mockup */}
            <div className="relative flex justify-center lg:justify-end">
              <div className="w-56 rounded-3xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-zinc-950 overflow-hidden">
                <div className="bg-zinc-800/60 px-4 py-3 flex items-center gap-2 border-b border-zinc-700">
                  <div className="h-2 w-2 rounded-full bg-zinc-600" />
                  <span className="text-xs text-zinc-400 font-medium">RSVP Reader</span>
                </div>
                <div className="p-5 flex flex-col items-center">
                  <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">350 WPM</p>
                  <div className="my-6 text-center">
                    <p className="text-2xl font-bold tracking-tight">
                      ex
                      <span className="text-zinc-300 underline decoration-zinc-500">tra</span>
                      ordinary
                    </p>
                  </div>
                  <div className="w-full h-1 rounded-full bg-zinc-800 mb-4">
                    <div className="h-1 w-2/5 rounded-full bg-zinc-500" />
                  </div>
                  <p className="text-[10px] text-zinc-500">Chapter 3 · 42%</p>
                </div>
                <div aria-hidden="true" className="border-t border-zinc-800 grid grid-cols-3 divide-x divide-zinc-800 text-center">
                  {['Library', 'Reader', 'Settings'].map((tab) => (
                    <button key={tab} tabIndex={-1} className={`py-2.5 text-[10px] font-medium ${tab === 'Reader' ? 'text-zinc-100' : 'text-zinc-500'}`}>
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="border-t border-zinc-800 bg-zinc-900/40 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-3 text-center text-3xl font-bold">Everything you need</h2>
          <p className="mb-12 text-center text-zinc-400">
            Built for readers who want to go faster without losing comprehension.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                <div className="mb-3 text-2xl">{feature.icon}</div>
                <h3 className="mb-2 font-semibold">{feature.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Device Section ───────────────────────────────────────── */}
      <section className="border-t border-zinc-800 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="order-2 lg:order-1">
              <div className="grid gap-3 grid-cols-2">
                {specs.map((spec) => (
                  <div key={spec.label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                    <p className="text-xs text-zinc-500 mb-1">{spec.label}</p>
                    <p className="font-semibold">{spec.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Optional Hardware — ~€25
              </p>
              <h2 className="mb-5 text-3xl font-bold leading-tight">
                Take reading
                <br />
                off the screen
              </h2>
              <p className="mb-6 text-zinc-400 leading-relaxed">
                Pair the app with a pocket-sized ESP32 device for a distraction-free
                reading experience. AMOLED or TFT display, single-button operation,
                weeks of battery life. Build it yourself for ~€25 in parts.
              </p>
              <p className="mb-8 text-sm text-zinc-500">
                The build guide is free. Source code is open. A donation is welcome but never required.
              </p>
              <Link
                to="/device"
                className="inline-block rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-semibold text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
              >
                Free build guide →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Open Source CTA ──────────────────────────────────────── */}
      <section className="border-t border-zinc-800 bg-zinc-900/40 py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="mb-4 text-3xl">🔓</div>
          <h2 className="mb-4 text-2xl font-bold">Fully open source</h2>
          <p className="mb-8 text-zinc-400 leading-relaxed">
            MicroPython firmware, Ionic/Capacitor app, and this site — all on GitHub.
            Fork it, modify it, submit a PR. No telemetry, no accounts required.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href="https://github.com/sch-28/rsvp"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-semibold text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
            >
              View on GitHub →
            </a>
            <Link
              to="/docs"
              className="rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-semibold text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
            >
              Read the docs →
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

const appFeatures = [
  'Book library with EPUB and TXT support',
  'Built-in chapter reader with themes and typography controls',
  'In-app RSVP reader at up to 1000 WPM',
  'Dictionary lookup and word highlights',
  'Chapter and TOC navigation for EPUB',
  'Bluetooth sync to ESP32 device (optional)',
]

const features = [
  {
    icon: '📚',
    title: 'Library & import',
    description:
      'Import EPUB or TXT from anywhere — Project Gutenberg, Standard Ebooks, your own files. Chapters auto-detected.',
  },
  {
    icon: '⚡',
    title: 'RSVP reading',
    description:
      'Words flash at your chosen WPM — 100 to 1000. Optimal Recognition Point keeps your eye locked to one spot.',
  },
  {
    icon: '📖',
    title: 'Built-in reader',
    description:
      'Full e-reader with dark, sepia, and light themes. Adjustable font, size, line spacing, and margins.',
  },
  {
    icon: '🔍',
    title: 'Dictionary & highlights',
    description:
      'Tap any word while reading to look it up. Highlight passages and search through them later.',
  },
  {
    icon: '🎛️',
    title: 'Tunable speed',
    description:
      'Adjust WPM, punctuation pause multipliers, acceleration ramp, and focal position to match your reading style.',
  },
  {
    icon: '📡',
    title: 'ESP32 sync',
    description:
      'Optionally pair with the hardware device. Sync your book and reading position over Bluetooth in seconds.',
  },
]

const specs = [
  { label: 'CPU', value: 'ESP32-S3' },
  { label: 'Display', value: 'AMOLED / TFT' },
  { label: 'Connectivity', value: 'BLE 5.0' },
  { label: 'Runtime', value: 'MicroPython' },
]
