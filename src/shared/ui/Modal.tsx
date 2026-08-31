import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/shared/hooks/useFocusTrap'
import { IconButton } from './IconButton'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Optional sticky action row, rendered outside the scrolling body — stays visible while children scrolls. */
  footer?: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, open)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    // Locks background scroll while the modal is open. Always restored —
    // on close and on unmount — so an interrupted session never leaves the
    // page stuck unscrollable.
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-index-modal)] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative flex max-h-[calc(100dvh-24px)] w-full flex-col overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-elevated sm:max-h-[85vh] sm:max-w-[460px]"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <h2 id="modal-title" className="text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <IconButton icon={<X className="h-5 w-5" />} label="Close" onClick={onClose} />
        </div>

        {/* The one scrolling region in the dialog — header and footer stay fixed in place around it. */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>

        {footer && <div className="shrink-0 border-t border-border px-4 py-3 sm:px-6 sm:py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
