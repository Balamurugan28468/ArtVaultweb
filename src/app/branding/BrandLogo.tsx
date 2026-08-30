/**
 * TEMPORARY placeholder brand mark. No approved ArtVault logo asset exists
 * in this repository yet (checked: public/ only has the default Vite
 * favicon/icons). Renders a documented text/gradient placeholder instead of
 * inventing a final logo — swap for `<img src="/brand/logo-*.svg" ... />`
 * once the owner adds the real asset (see public/brand/README.md).
 */
function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const sizeClasses = size === 'lg' ? 'h-11 w-11 text-lg' : 'h-9 w-9 text-base'
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-primary to-accent-gold font-bold text-white shadow-card ${sizeClasses}`}
    >
      A
    </span>
  )
}

export function BrandLogo({ variant = 'full' }: { variant?: 'full' | 'mark' }) {
  if (variant === 'mark') {
    return (
      <span aria-label="ArtVault" className="inline-flex">
        <BrandMark />
      </span>
    )
  }

  return (
    <span aria-label="ArtVault" className="inline-flex items-center gap-2.5">
      <BrandMark size="lg" />
      <span className="text-xl leading-none font-bold tracking-wide text-text-primary">
        Art<span className="text-accent-gold">Vault</span>
      </span>
    </span>
  )
}
