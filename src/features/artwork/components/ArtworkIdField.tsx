import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/shared/ui'

/**
 * UI-03 final correction — the real Firestore document id, shown read-only
 * on both the public artwork detail page and the seller's own artwork
 * edit/detail page, so an admin moderating a reported artwork (or a seller
 * reporting one) never has to go spelunking in a URL or the Firestore
 * console to find it. Deliberately the *only* internal field ever exposed
 * here — never sellerId, reviewedAt, or anything else not already visible
 * elsewhere on the page.
 */
export function ArtworkIdField({ artworkId, className = '' }: { artworkId: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const toast = useToast()

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(artworkId)
      setCopied(true)
      toast.success('Artwork ID copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy — copy it manually instead.")
    }
  }

  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${className}`}>
      <code className="truncate rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-xs text-text-secondary">{artworkId}</code>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label="Copy artwork ID"
        title="Copy artwork ID"
        className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
      >
        {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
