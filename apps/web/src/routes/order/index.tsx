import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/order/')({
  component: OrderPage,
})

function OrderPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="mb-4 text-4xl font-bold">Order assembled</h1>
      <p className="mb-8 text-zinc-400">
        Assembled AMOLED units are available for €50–70, fully tested and
        ready to use. Reach out to place an order.
      </p>
      {/* TODO: replace with real contact email */}
      <a
        href="mailto:contact@example.com"
        className="inline-block rounded-lg bg-zinc-100 px-8 py-3 font-semibold text-zinc-900 hover:bg-white transition-colors"
      >
        Contact to order
      </a>
    </div>
  )
}
