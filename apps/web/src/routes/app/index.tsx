import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/')({
  component: AppPage,
})

const features = [
  {
    icon: '📚',
    title: 'Book library',
    description:
      'Import EPUB and TXT from any source. Metadata, cover art, and chapter structure are extracted automatically.',
  },
  {
    icon: '⚡',
    title: 'RSVP reader',
    description:
      'Flash words at 100–1000 WPM with the Optimal Recognition Point (ORP) aligned for each word length.',
  },
  {
    icon: '📖',
    title: 'Built-in e-reader',
    description:
      'Full reading view with dark, sepia, and light themes. Adjust font, size, line spacing, and margins.',
  },
  {
    icon: '📑',
    title: 'Chapter navigation',
    description:
      'EPUB table of contents with chapter jump. Tap any chapter to continue reading from there.',
  },
  {
    icon: '🔍',
    title: 'Dictionary lookup',
    description:
      'Tap any word in the reader to look it up instantly. Highlight and search across your notes.',
  },
  {
    icon: '📡',
    title: 'Device sync',
    description:
      'Pair with an ESP32 reader over Bluetooth. Sync your active book and keep your position in sync across both.',
  },
]

const requirements = [
  { label: 'Platform', value: 'Android 8.0+' },
  { label: 'Storage', value: '~30 MB + books' },
  { label: 'Permissions', value: 'Bluetooth (optional)' },
]

function AppPage() {
  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="border-b border-zinc-800 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Android App — Free &amp; Open Source
          </p>
          <h1 className="mb-5 text-4xl font-bold leading-tight sm:text-5xl">
            RSVP Reader
            <br />
            <span className="text-zinc-400">for Android</span>
          </h1>
          <p className="mb-10 max-w-xl text-lg text-zinc-400 leading-relaxed">
            A full-featured reading app with a built-in RSVP engine. Import EPUB
            and TXT books, read at your own pace or blast through chapters at
            300–600 WPM. No account required, no tracking, fully offline.
          </p>
          <div className="flex flex-wrap gap-4">
            {/* Play Store badge — not yet published */}
            <div
              aria-disabled="true"
              className="inline-flex cursor-not-allowed items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-3 opacity-50"
              title="Coming soon"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-zinc-300" aria-hidden="true">
                <path d="M3.18 23.76a2.5 2.5 0 0 1-1.18-2.2V2.44A2.5 2.5 0 0 1 3.18.24l11.4 11.76-11.4 11.76zM16.09 13.41l2.62 2.71-9.68 5.5 7.06-8.21zM20.13 9.7c.57.33.87.84.87 1.54 0 .62-.3 1.19-.87 1.52l-2.18 1.24-2.9-2.99 2.9-2.99 2.18 1.68zM9.03 2.38l9.68 5.5-2.62 2.71-7.06-8.21z" />
              </svg>
              <div className="text-left">
                <p className="text-[10px] text-zinc-500">Get it on</p>
                <p className="text-sm font-semibold text-zinc-200">Google Play</p>
              </div>
            </div>
            {/* APK direct download */}
            <a
              href="https://github.com/sch-28/rsvp/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-3 hover:border-zinc-500 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6 stroke-zinc-300 fill-none stroke-2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <div className="text-left">
                <p className="text-[10px] text-zinc-500">Direct download</p>
                <p className="text-sm font-semibold text-zinc-200">APK (GitHub)</p>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* ── Feature Grid ─────────────────────────────────────────── */}
      <section className="border-b border-zinc-800 bg-zinc-900/40 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-3 text-2xl font-bold">What's included</h2>
          <p className="mb-12 text-zinc-400">Everything you need to read faster and smarter.</p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                <div className="mb-3 text-2xl">{f.icon}</div>
                <h3 className="mb-2 font-semibold">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Requirements ─────────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-8 text-2xl font-bold">Requirements</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {requirements.map((r) => (
              <div key={r.label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                <p className="text-xs text-zinc-500 mb-1">{r.label}</p>
                <p className="font-semibold">{r.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-zinc-500">
            The app works entirely offline. An ESP32 device and cloud account are optional.
          </p>
        </div>
      </section>
    </div>
  )
}
