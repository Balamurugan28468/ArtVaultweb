function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

export function Avatar({
  name,
  photoURL,
  size = 'md',
}: {
  name: string
  photoURL?: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  // UI-01 mobile density pass: `lg` shrinks on the smallest screens rather
  // than staying a fixed 56px everywhere — both of its current callers
  // (PublicArtistHeader, AccountHeader) are page-header avatars where the
  // owner specifically asked for a denser mobile header.
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-11 w-11 text-base sm:h-14 sm:w-14 sm:text-lg',
  }[size]

  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name}
        className={`inline-flex shrink-0 rounded-full object-cover ${sizeClasses}`}
      />
    )
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-primary/20 font-semibold text-brand-primary ${sizeClasses}`}
      aria-hidden="true"
    >
      {initialsFrom(name)}
    </span>
  )
}
