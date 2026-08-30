import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/shared/hooks/useFocusTrap'
import { IconButton } from './IconButton'

export function Drawer({
  open,
  onClose,
  title,
  side = 'left',
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  side?: 'left' | 'right'
  children: ReactNode
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

  if (!open) return null

  const sideClasses = side === 'left' ? 'left-0' : 'right-0'

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-index-drawer)]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={`absolute top-0 bottom-0 ${sideClasses} flex w-72 max-w-[85vw] flex-col border-border bg-surface-elevated p-4 shadow-elevated`}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="drawer-title" className="text-base font-semibold text-text-primary">
            {title}
          </h2>
          <IconButton icon={<X className="h-5 w-5" />} label="Close menu" onClick={onClose} />
        </div>
        <div className="mt-4 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
