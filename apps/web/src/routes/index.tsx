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
        {/* Background video */}
        <video
          src="/landing.mp4"
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
          onEnded={handleVideoEnded}
        />
        {/* Overlay */}
        <div className="absolute inset-0 bg-zinc-950/60" />
        {/* Content */}
        <div className="relative mx-auto max-w-5xl px-6 py-40 text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-400">
            Rapid Serial Visual Presentation
          </p>
          <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl">
            Read faster.
            <br />
            <span className="text-zinc-300">One word at a time.</span>
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-lg text-zinc-300">
            A pocket-sized ESP32 device that flashes words at 350+ WPM, paired
            with a companion app for your library. Open-source hardware you can
            build yourself or order assembled.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/order"
              className="rounded-lg bg-zinc-100 px-8 py-3 font-semibold text-zinc-900 hover:bg-white transition-colors"
            >
              Order assembled — €50–70
            </Link>
            <Link
              to="/diy"
              className="rounded-lg border border-zinc-400 px-8 py-3 font-semibold text-zinc-200 hover:border-white hover:text-white transition-colors"
            >
              Build it yourself — €5 guide
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="border-t border-zinc-800 bg-zinc-900/40 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-12 text-center text-3xl font-bold">
            Everything you need
          </h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                <div className="mb-3 text-2xl">{feature.icon}</div>
                <h3 className="mb-2 font-semibold">{feature.title}</h3>
                <p className="text-sm text-zinc-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Device ───────────────────────────────────────────────── */}
      <section className="border-t border-zinc-800 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-4 text-3xl font-bold">The hardware</h2>
          <p className="mb-10 text-zinc-400 max-w-xl">
            Runs MicroPython on an ESP32-S3. AMOLED or ST7789 display. Single
            button operation. Weeks of battery life in deep sleep.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {specs.map((spec) => (
              <div key={spec.label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                <p className="text-xs text-zinc-500 mb-1">{spec.label}</p>
                <p className="font-semibold">{spec.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Getting Books ─────────────────────────────────────────── */}
      <section className="border-t border-zinc-800 bg-zinc-900/40 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-4 text-3xl font-bold">Getting books</h2>
          <p className="mb-8 text-zinc-400 max-w-xl">
            Import TXT or EPUB files from anywhere. The companion app strips
            formatting and uploads plain text to your device over Bluetooth.
          </p>
          <div className="flex flex-wrap gap-3">
            {bookSources.map((source) => (
              <span key={source} className="rounded-full border border-zinc-700 px-4 py-1.5 text-sm text-zinc-300">
                {source}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── DIY vs Assembled ─────────────────────────────────────── */}
      <section className="border-t border-zinc-800 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-10 text-center text-3xl font-bold">
            Build it or buy it
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-500">
                DIY
              </p>
              <p className="mb-4 text-3xl font-bold">€5</p>
              <p className="mb-6 text-zinc-400 text-sm">
                Step-by-step guide: parts list, wiring diagram, firmware
                flashing. ~€25 in hardware.
              </p>
              <Link
                to="/diy"
                className="inline-block rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-semibold hover:border-zinc-500 transition-colors"
              >
                Get the guide →
              </Link>
            </div>
            <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-8 ring-1 ring-zinc-600">
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-500">
                Assembled
              </p>
              <p className="mb-4 text-3xl font-bold">€50–70</p>
              <p className="mb-6 text-zinc-400 text-sm">
                Fully built AMOLED variant. Tested, flashed, and ready to sync
                with the companion app.
              </p>
              <Link
                to="/order"
                className="inline-block rounded-lg bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white transition-colors"
              >
                Order now →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

const features = [
  {
    icon: '⚡',
    title: 'Speed reading',
    description:
      'Words flash at your chosen WPM — 100 to 1000. Optimal Recognition Point keeps your eye locked to one spot.',
  },
  {
    icon: '📱',
    title: 'Companion app',
    description:
      'Android app manages your library, syncs books over Bluetooth, and mirrors the RSVP engine for on-phone reading.',
  },
  {
    icon: '🔋',
    title: 'Battery life',
    description:
      'Deep sleep between reading sessions stretches a small LiPo battery to weeks of daily use.',
  },
  {
    icon: '📚',
    title: 'EPUB & TXT',
    description:
      'Import from Project Gutenberg, Standard Ebooks, or your own files. EPUB chapters become navigable sections.',
  },
  {
    icon: '🎛️',
    title: 'Tunable',
    description:
      'Adjust WPM, punctuation delays, acceleration ramp, focal position, and backlight — all from the app.',
  },
  {
    icon: '🔓',
    title: 'Open source',
    description:
      'MicroPython firmware and React app are fully open. Fork, modify, and flash your own variant.',
  },
]

const specs = [
  { label: 'CPU', value: 'ESP32-S3' },
  { label: 'Display', value: 'AMOLED / TFT' },
  { label: 'Connectivity', value: 'BLE 5.0' },
  { label: 'Runtime', value: 'MicroPython' },
]

const bookSources = [
  'Project Gutenberg',
  'Standard Ebooks',
  'Your own TXT files',
  'EPUB files',
  'Any plain text',
]
