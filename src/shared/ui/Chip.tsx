export function Chip({
  label,
  selected = false,
  onClick,
}: {
  label: string
  selected?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors duration-150 ease-standard ${
        selected
          ? 'border-brand-primary bg-brand-primary/15 text-brand-primary'
          : 'border-border-strong text-text-secondary hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  )
}
