import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Button, Modal } from '@/shared/ui'

const SUGGESTED_ACTIONS = ['Recommend artwork', 'Find art by category', 'Explain this artist']

/**
 * The ArtVault AI Assistant's real, clickable launcher — Module 00 shipped
 * this as a permanently-disabled visual placeholder ("available in a later
 * module"); this UI-01 follow-up makes it a genuine, honest entry point,
 * per the owner's explicit product decision that AR/AI must now be
 * recognizable, real parts of the UI even before their backends exist.
 *
 * No AI provider is connected yet (see docs/AI_ARCHITECTURE.md — interface
 * defined, nothing implemented: no key, no gateway function), so the panel
 * this opens says so plainly rather than simulating a conversation — every
 * suggested action and the composer itself are genuinely disabled
 * `<button>`/`<input>` elements, and no reply is ever fabricated.
 *
 * Positioned above the mobile bottom nav and clear of device safe areas on
 * both axes; still hidden below a 700px-tall viewport, where no fixed
 * corner position is guaranteed collision-free with real page content —
 * that reasoning doesn't change just because the button now does something.
 */
export function AIAssistantLauncher() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  // UI architecture only (Module 00's AI gateway doesn't exist yet) — see
  // docs/AI_ARCHITECTURE.md. This only decides which honest, inert
  // suggestion chip to show; it never calls a model or reads the artwork.
  const onArtworkPage = location.pathname.startsWith('/artworks/')

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="ArtVault AI Assistant"
        title="ArtVault AI Assistant"
        className="fixed z-[var(--z-index-floating-action)] hidden h-14 w-14 items-center justify-center rounded-full bg-brand-primary-hover text-white shadow-elevated ring-2 ring-brand-primary/40 ring-offset-2 ring-offset-bg transition-transform duration-150 ease-standard hover:bg-brand-primary-active motion-safe:hover:scale-105 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] [@media(min-height:700px)]:flex lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <Sparkles aria-hidden="true" className="h-6 w-6" />
        <span
          aria-hidden="true"
          className="absolute -right-1 -bottom-1 flex h-5 items-center justify-center rounded-full bg-accent-gold px-1.5 text-[10px] font-bold text-text-on-light shadow-card"
        >
          AI
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="ArtVault AI">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">What can I help you discover?</p>
          <p className="rounded-md border border-brand-primary/30 bg-brand-primary/10 px-3 py-2 text-xs text-brand-primary-on-dark">
            The AI assistant isn't connected yet — this is a preview of what's coming.
          </p>
          {/* UI-05: a real, working link into the full AI Assistant page —
              the one genuinely functional action this panel offers today. */}
          <Link to="/ai" onClick={() => setOpen(false)} className="text-sm font-medium text-brand-primary-on-dark hover:underline">
            Open full AI Assistant →
          </Link>
          <div className="flex flex-col gap-2">
            {onArtworkPage && (
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Available once the AI assistant is connected"
                className="rounded-md border border-border-strong px-3 py-2 text-left text-sm text-text-secondary opacity-60 disabled:cursor-not-allowed"
              >
                Ask ArtVault AI about this artwork
              </button>
            )}
            {SUGGESTED_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                disabled
                aria-disabled="true"
                title="Available once the AI assistant is connected"
                className="rounded-md border border-border-strong px-3 py-2 text-left text-sm text-text-secondary opacity-60 disabled:cursor-not-allowed"
              >
                {action}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              disabled
              aria-label="Message ArtVault AI"
              placeholder="AI assistant coming soon…"
              className="h-11 flex-1 rounded-md border border-border-strong bg-surface px-3 text-sm text-text-muted placeholder:text-text-muted disabled:cursor-not-allowed"
            />
            <Button type="button" disabled size="md">
              Send
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
