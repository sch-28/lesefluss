/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import * as React from 'react'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'

const CURRENT_YEAR = new Date().getFullYear()

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ...seo({
        title: 'RSVP Reader — Speed Reading Device & App',
        description:
          'A handheld ESP32 speed reader that displays books word-by-word at 350+ WPM. Open-source hardware with a companion mobile app.',
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link to="/" className="text-lg font-semibold tracking-tight">
              RSVP Reader
            </Link>
            <nav className="flex items-center gap-6 text-sm text-zinc-400">
              <Link
                to="/diy"
                activeProps={{ className: 'text-zinc-100' }}
                className="hover:text-zinc-100 transition-colors"
              >
                Build It
              </Link>
              <Link
                to="/order"
                activeProps={{ className: 'text-zinc-100' }}
                className="rounded-md bg-zinc-100 px-4 py-1.5 font-medium text-zinc-900 hover:bg-white transition-colors"
              >
                Order
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t border-zinc-800 py-10 text-center text-sm text-zinc-500">
          <div className="mx-auto max-w-5xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span>© {CURRENT_YEAR} RSVP Reader</span>
            <a
              href="https://github.com/sch-28/rsvp"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300 transition-colors"
            >
              GitHub
            </a>
          </div>
        </footer>
        <Scripts />
      </body>
    </html>
  )
}
