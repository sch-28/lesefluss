import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/diy/')({
  component: DiyPage,
})

function DiyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="mb-4 text-4xl font-bold">Build it yourself</h1>
      <p className="text-zinc-400">
        The DIY guide is coming soon. It will include a full parts list, wiring
        diagram, and step-by-step firmware flashing instructions.
      </p>
    </div>
  )
}
