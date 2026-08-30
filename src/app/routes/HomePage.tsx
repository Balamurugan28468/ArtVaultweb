import { Card } from '@/shared/ui'

export function HomePage() {
  return (
    <section className="flex flex-col gap-6">
      <Card className="relative overflow-hidden px-6 py-12 text-center sm:px-10 sm:py-16">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 via-transparent to-accent-gold/10"
        />
        <div className="relative flex flex-col items-center gap-3">
          <p className="text-xs font-semibold tracking-[0.2em] text-accent-gold uppercase">Art Beyond Limits</p>
          <h1 className="text-3xl font-bold text-text-primary sm:text-4xl">Welcome to ArtVault</h1>
          <p className="max-w-xl text-text-secondary">
            A premium home for discovering, collecting, and trading extraordinary art — with
            AI-powered discovery, live auctions, and augmented-reality previews.
          </p>
          <p className="mt-2 text-sm text-text-muted">
            The full marketplace experience will appear here as each module is built.
          </p>
        </div>
      </Card>
    </section>
  )
}
