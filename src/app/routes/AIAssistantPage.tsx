import { Compass, Gavel, HelpCircle, Menu, MessageSquarePlus, Package, Sparkles, User } from 'lucide-react'
import { useState, type ComponentType, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button, Card, Container, Drawer, IconButton } from '@/shared/ui'

const SUGGESTED_CHIPS = [
  'Show me artworks under ₹5,000',
  'What artworks are in the upcoming auction?',
  'Help me find abstract artworks',
  'Tell me about an artist',
  'How does AR preview work?',
  'Help me understand my order',
]

const CAPABILITY_CARDS: { icon: ComponentType<{ className?: string }>; title: string; description: string; href?: string }[] = [
  { icon: Compass, title: 'Find Artworks', description: 'Search and discover unique art pieces.', href: '/explore' },
  { icon: Sparkles, title: 'Analyze Artwork', description: 'Get AI-powered insights about any artwork.' },
  { icon: Gavel, title: 'Explore Auctions', description: 'Know upcoming auctions and featured pieces.', href: '/auctions' },
  { icon: User, title: 'Artist Information', description: 'Learn about artists, styles, and history.' },
]

interface SidebarItem {
  icon: ComponentType<{ className?: string }>
  label: string
  href?: string
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { icon: Compass, label: 'Discover Art', href: '/explore' },
  { icon: Sparkles, label: 'Artwork Analysis' },
  { icon: Gavel, label: 'Auction Help', href: '/auctions' },
  { icon: User, label: 'Artist Information' },
  { icon: Package, label: 'Order & Support', href: '/orders' },
  { icon: HelpCircle, label: 'Tips & Guides' },
]

/** The sidebar's real content — shared verbatim between the permanent desktop `<aside>` and the mobile drawer (see AIAssistantPage's own header comment) so the two surfaces can never drift apart into two different navigation lists. */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="ArtVault AI isn't connected yet"
        className="flex items-center gap-2 rounded-md border border-accent-gold/40 bg-accent-gold/10 px-3 py-2.5 text-sm font-medium text-accent-gold opacity-70 disabled:cursor-not-allowed"
      >
        <MessageSquarePlus aria-hidden="true" className="h-4 w-4" />
        New Chat
      </button>

      <nav aria-label="AI Assistant" className="flex flex-col gap-1">
        {SIDEBAR_ITEMS.map((item) =>
          item.href ? (
            <Link
              key={item.label}
              to={item.href}
              onClick={onNavigate}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
            >
              <item.icon aria-hidden="true" className="h-4 w-4" />
              {item.label}
            </Link>
          ) : (
            <span
              key={item.label}
              aria-disabled="true"
              title={`${item.label} — not connected yet`}
              className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm text-text-muted opacity-60"
            >
              <item.icon aria-hidden="true" className="h-4 w-4" />
              {item.label}
            </span>
          ),
        )}
      </nav>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">Recent Chats</p>
        {/* No conversation persistence exists anywhere in this codebase — this is the honest, permanent state, not a loading placeholder. */}
        <p className="text-sm text-text-muted">No saved conversations yet.</p>
      </div>

      <Card className="mt-auto flex items-center gap-3 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary/20 text-brand-primary-on-dark">
          <Sparkles aria-hidden="true" className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-text-primary">ArtVault AI</p>
          <p className="text-xs text-text-muted">Your always-on art companion</p>
        </div>
      </Card>
    </>
  )
}

/**
 * UI-05 — the full ArtVault AI Assistant page. No AI gateway Cloud
 * Function exists yet (see docs/AI_ARCHITECTURE.md — "interface defined,
 * nothing implemented: no provider, no key, no gateway function"), so
 * this is a real, production-ready chat *shell* with zero fabricated
 * intelligence: the message input and suggestion chips are genuinely
 * interactive (a chip click really does fill the input — a real, honest
 * convenience, not a fake AI action), but Send is always disabled with a
 * plain explanation, and no reply is ever synthesized. Sidebar items
 * either navigate to a real existing destination (Discover Art → Explore,
 * Auction Help → Auctions, Order & Support → Orders) or are disabled with
 * an honest reason when no such destination/backend exists yet. "Recent
 * Chats" says so plainly rather than inventing history — no conversation
 * persistence exists anywhere in this codebase.
 *
 * Mobile correction pass: the permanent sidebar (`SidebarContent`) is
 * `hidden` below `lg` and re-rendered inside a `Drawer` instead, opened by
 * a compact "Menu" button in a mobile-only top bar — so a phone visitor
 * sees the actual AI greeting/cards/composer first, never the full
 * navigation list stacked above it. Desktop keeps the exact same
 * permanent sidebar, unchanged.
 */
export function AIAssistantPage() {
  const [message, setMessage] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Deliberately a no-op beyond preventing a page reload — there is
    // nothing to send to, and this must never simulate a reply.
  }

  return (
    <Container size="wide">
      {/* Mobile-only compact top bar — replaces the permanent sidebar below `lg`. */}
      <div className="mb-4 flex items-center gap-2 lg:hidden">
        <IconButton icon={<Menu className="h-5 w-5" />} label="Open AI Assistant menu" onClick={() => setMenuOpen(true)} />
        <Sparkles aria-hidden="true" className="h-5 w-5 text-brand-primary-on-dark" />
        <h1 className="font-display text-lg font-medium text-text-primary">AI Assistant</h1>
      </div>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="AI Assistant" side="left">
        <div className="flex h-full flex-col gap-4">
          <SidebarContent onNavigate={() => setMenuOpen(false)} />
        </div>
      </Drawer>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-6">
        <aside className="hidden w-64 shrink-0 flex-col gap-4 lg:flex">
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="h-5 w-5 text-brand-primary-on-dark" />
            <h1 className="font-display text-lg font-medium text-text-primary">AI Assistant</h1>
          </div>
          <SidebarContent />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary-on-dark">
              <Sparkles aria-hidden="true" className="h-8 w-8" />
            </span>
            <h2 className="font-display text-2xl font-medium text-text-primary">Hello, I'm ArtVault AI</h2>
            <p className="max-w-md text-sm text-text-secondary">
              Your personal art assistant. Discover, explore, learn, and get help across ArtVault.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CAPABILITY_CARDS.map((card) =>
              card.href ? (
                <Link key={card.title} to={card.href}>
                  <Card className="flex h-full flex-col gap-2 p-4 transition-colors duration-150 ease-standard hover:border-accent-gold/50">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-primary/15 text-brand-primary-on-dark">
                      <card.icon aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-medium text-text-primary">{card.title}</p>
                    <p className="text-xs text-text-secondary">{card.description}</p>
                  </Card>
                </Link>
              ) : (
                <Card key={card.title} className="flex h-full flex-col gap-2 p-4 opacity-70" title={`${card.title} — not connected yet`}>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-primary/15 text-brand-primary-on-dark">
                    <card.icon aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <p className="text-sm font-medium text-text-primary">{card.title}</p>
                  <p className="text-xs text-text-secondary">{card.description}</p>
                </Card>
              ),
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-text-secondary">Try asking me something…</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setMessage(chip)}
                  className="rounded-full border border-border-strong px-3 py-1.5 text-sm text-text-secondary transition-colors duration-150 ease-standard hover:border-accent-gold/50 hover:text-text-primary"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-auto flex flex-col gap-2 border-t border-border pt-4 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="ai-assistant-message">
                Message ArtVault AI
              </label>
              <input
                id="ai-assistant-message"
                type="text"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Type your message here…"
                aria-describedby="ai-assistant-disabled-note"
                className="h-12 flex-1 rounded-md border border-border-strong bg-surface-elevated px-4 text-sm text-text-primary placeholder:text-text-muted"
              />
              <Button type="submit" variant="gold" disabled title="ArtVault AI isn't connected yet">
                Send
              </Button>
            </div>
            <p id="ai-assistant-disabled-note" className="text-xs text-text-muted">
              ArtVault AI isn't connected yet — responses aren't available. AI Assistant is in beta and, once
              connected, responses may not always be accurate; always verify important information.
            </p>
          </form>
        </div>
      </div>
    </Container>
  )
}
