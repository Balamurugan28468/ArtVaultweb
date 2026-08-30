import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

export function Dropdown({
  trigger,
  children,
  align = 'end',
}: {
  trigger: (props: { onClick: () => void; open: boolean }) => ReactNode
  children: ReactNode
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative inline-block">
      {trigger({ onClick: () => setOpen((v) => !v), open })}
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-[var(--z-index-dropdown)] mt-2 min-w-40 rounded-md border border-border bg-surface-elevated py-1 shadow-elevated ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export const dropdownItemClassName = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-surface'

export function DropdownItem({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" role="menuitem" className={`${dropdownItemClassName} ${className}`} {...props}>
      {children}
    </button>
  )
}
