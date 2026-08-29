# ArtVault — Augmented Reality Architecture

**Status: design only.** No AR viewer, asset pipeline, or `<ViewInAR>`
component exists yet.

## Pipeline

```
Artwork UI  →  <ViewInAR />  →  ArtworkVisualizationService
           →  CapabilityDetection  →  AR/Visualization Provider  →  Graceful Fallback
```

- **Provider:** Google's `<model-viewer>` web component (Apache-2.0, free,
  open-source). It uses WebXR for in-browser Android Chrome AR, and
  auto-hands-off to Android Scene Viewer / iOS AR Quick Look on supported
  devices, with a built-in non-AR 3D orbit viewer everywhere else.
- **`CapabilityDetection`:** checks `navigator.xr?.isSessionSupported`,
  then platform eligibility for Scene Viewer/Quick Look, then falls back
  to the non-AR 3D orbit view, then to a static image with an explicit
  "AR not supported on this device" notice. Camera permission denial and
  session initialization failure are surfaced into ArtVault's own UI state
  through `model-viewer`'s AR session events, not silently swallowed.
- **`ArtworkVisualizationService`:** the single owner of AR session
  lifecycle (init, placement, reposition/rotate/scale, reset, capture,
  exit) — every page's `<ViewInAR>` is a thin, identical wrapper around it.
  No page implements its own AR logic.

## Honest fact: a photo is not a model

An uploaded JPG/PNG/WebP artwork photo is **not** itself an AR-ready
model. The asset pipeline for flat artwork:

```
artwork image + real physical width (cm) + real physical height (cm)
  + optional depth/frame thickness
       ↓
thin textured plane — a generated, GLB-compatible mesh sized exactly to
those dimensions, textured with the artwork image
       ↓
served to <model-viewer> (src: generated .glb; ios-src: generated .usdz
where produced)
       ↓
placed on a wall or floor per arPlacement
```

- `arPlacement: 'wall' | 'floor'` is chosen per artwork/product type at
  creation time (paintings/wall art → `wall`; sculptures/pedestal pieces →
  `floor`).
- **If real physical width/height are missing, AR is not offered for that
  artwork.** No default or guessed dimension is ever used — this is
  enforced at the data-model level (see `docs/DATABASE.md`, the `ar` field
  on `artworks`), not just as a UI suggestion. Scale is never presented as
  physically accurate when it isn't backed by real measurements.
- Generating the plane/GLB from an uploaded image is real, buildable work
  using open-source glTF tooling — it belongs to the AR module, not
  Module 00.

## Honest fact: the external viewer owns its own UI

Once a session hands off to Android Scene Viewer or iOS AR Quick Look,
that external viewer owns its own UI. ArtVault's custom "Add to Cart,"
"Buy Now," or screenshot buttons will **not** appear inside it — this is a
platform constraint, not a gap to engineer around.

- Commerce controls (Add to Cart / Buy Now) are shown **before** entering
  the AR session, and restored immediately **on return** from it.
- Where the in-browser (non-handoff) WebXR path is used, in-app overlay
  controls are possible and will be offered there.
- Screenshot/capture is treated as capability-dependent — available where
  the browser/session genuinely supports it, absent otherwise. It is never
  faked with a static image presented as a live capture.

## Required call sites (one shared component, no per-page logic)

Home, Marketplace, Search, Categories, Artwork Details, Artist Profile,
Seller Storefront, Wishlist, Cart, AI Recommendations, Auction, Auction
Details, Admin Preview (where appropriate).

## Testing constraint

Real AR sessions cannot be verified in desktop Chrome. Genuine testing
requires a physical Android (Chrome) or iOS (Safari) device — planned for
before the AR module starts, not discovered during it.
