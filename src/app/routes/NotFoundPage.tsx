import { Compass, Home } from 'lucide-react'
import { Link } from 'react-router'
import { buttonClassName, Container } from '@/shared/ui'

/**
 * UI-01 — the router previously had no catch-all route at all (a genuine
 * gap found during the UI audit, unrelated to any reference image): an
 * unmatched URL rendered nothing defined. This is the last child of the
 * root route (see router.tsx), so it inherits the normal AppShell chrome
 * (nav, AI launcher) exactly like every other page instead of a bare error.
 */
export function NotFoundPage() {
  return (
    <Container>
      <section className="flex flex-col items-center gap-4 py-16 text-center">
        <span className="font-display text-6xl font-medium text-accent-gold">404</span>
        <h1 className="font-display text-2xl font-medium text-text-primary">Page not found</h1>
        <p className="max-w-sm text-sm text-text-secondary">
          The page you're looking for doesn't exist, or may have moved.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link to="/" className={buttonClassName('primary', 'md')}>
            <Home aria-hidden="true" className="h-4 w-4" />
            Back home
          </Link>
          <Link to="/explore" className={buttonClassName('secondary', 'md')}>
            <Compass aria-hidden="true" className="h-4 w-4" />
            Explore artworks
          </Link>
        </div>
      </section>
    </Container>
  )
}
