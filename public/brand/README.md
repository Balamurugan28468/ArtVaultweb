# ArtVault brand assets — expected path contract

No approved logo asset has been added to this repository yet. The owner's
reference designs (the colorful "ArtVault A / Art Beyond Limits" mark)
exist only as images shared in conversation, not as files here.
`src/app/branding/BrandLogo.tsx` renders a documented temporary
text/gradient placeholder in the meantime — it does not invent a
substitute final logo.

When the real asset is ready, add it here using these filenames so
`BrandLogo.tsx` (and the favicon in `index.html`) can be swapped over in
one small change:

- `logo-mark.svg` — compact square mark (used collapsed/mobile), ideally
  a single SVG, transparent background, roughly square aspect ratio.
- `logo-wordmark.svg` — full horizontal lockup (used in the desktop top
  bar), SVG preferred so it scales without a fixed raster size.
- `favicon.svg` (or a favicon set: `favicon-32.png`, `favicon-192.png`,
  `apple-touch-icon.png`) — replaces `public/favicon.svg`.

Keep source files reasonably sized (optimized SVG, or compressed raster
only if SVG isn't available) and give each an explicit width/height (or
`aspect-ratio`) wherever it's used, so adding the real asset doesn't
introduce a layout shift. Every place `BrandLogo` is used already includes
accessible naming (`aria-label="ArtVault"`); once swapped to a real
`<img>`, keep a meaningful `alt="ArtVault"` rather than an empty one,
since the logo is identifying content, not decoration.
