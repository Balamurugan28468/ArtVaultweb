import { Share2 } from 'lucide-react'
import { IconButton } from './IconButton'
import { useToast } from './Toast'

/**
 * Real sharing (Module 11) — native Web Share where the browser supports
 * it, an honest clipboard copy-link fallback everywhere else. Never
 * fabricates a share count or any other engagement number; this is purely
 * an action, not a metric.
 */
export function ShareButton({ url, title, text }: { url: string; title: string; text?: string }) {
  const toast = useToast()

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied to clipboard')
    } catch {
      toast.error("Couldn't copy the link — copy it from your browser's address bar instead.")
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url })
      } catch (error) {
        // The user closing the native share sheet without picking anything
        // throws an AbortError — that's a cancellation, not a failure, so
        // it falls through to nothing rather than the copy-link fallback.
        if (error instanceof Error && error.name === 'AbortError') return
        await copyLink()
      }
      return
    }
    await copyLink()
  }

  return (
    <IconButton
      icon={<Share2 className="h-5 w-5" aria-hidden="true" />}
      label="Share this artwork"
      variant="ghost"
      onClick={() => void handleShare()}
    />
  )
}
