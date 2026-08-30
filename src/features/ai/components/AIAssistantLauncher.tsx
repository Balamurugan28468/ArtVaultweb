import { Sparkles } from 'lucide-react'

/**
 * Reserves the approved ArtVault AI Assistant's floating visual identity.
 * The AI Assistant module itself is not implemented yet, so this is a
 * genuinely non-interactive, honestly-labeled affordance — no panel, no
 * simulated chat, no API calls (see ARTVAULT_PROJECT_STATE.md → Module 02
 * planning decisions). Positioned above the mobile bottom nav and clear of
 * device safe areas on both axes.
 *
 * On short viewports (<700px tall — e.g. small/older phones, or any tall
 * scrollable form filling the screen) there is no guaranteed collision-free
 * position for a fixed corner button, since scrolled content can pass
 * beneath it regardless of placement. Since this is a non-functional
 * placeholder, preserving usability of real content wins: it hides itself
 * entirely below that height rather than risk sitting on top of a form
 * field, button, or link.
 */
export function AIAssistantLauncher() {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      aria-label="ArtVault AI Assistant — available in a later module"
      title="ArtVault AI Assistant — available in a later module"
      className="fixed z-[var(--z-index-floating-action)] hidden h-14 w-14 cursor-not-allowed items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-accent-gold text-white opacity-80 shadow-elevated ring-2 ring-accent-gold/40 ring-offset-2 ring-offset-bg bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] [@media(min-height:700px)]:flex lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      <Sparkles aria-hidden="true" className="h-6 w-6" />
      <span
        aria-hidden="true"
        className="absolute -right-1 -bottom-1 flex h-5 items-center justify-center rounded-full bg-accent-gold px-1.5 text-[10px] font-bold text-text-on-light shadow-card"
      >
        AI
      </span>
    </button>
  )
}
