# ArtVault — Architecture

## Structure: feature-first

```
src/
  app/                  composition root: routes, providers, layouts
    routes/
    providers/
    layouts/
  features/
    auth/ account/ seller-studio/ artwork/ artist-profile/
    marketplace/ search/ wishlist/ likes/ follows/ sharing/
    cart/ checkout/ orders/ inventory/ reviews/ notifications/
    ai/ auctions/ ar/ admin/
  shared/
    ui/ hooks/ utils/ types/
  lib/
    firebase/           client SDK init only
    api/                typed wrappers around Cloud Functions callables
  config/               env schema, constants
```

Each `features/x/` owns its own `components/`, `hooks/`, `api/`, `types.ts`, and
exposes a public surface through `index.ts`. Other features and the app shell
import only through that `index.ts` — never reach into another feature's
internals directly. Module 00 creates the top-level feature folders as empty
placeholders (`export {}`); each feature's internal structure is filled in
when that feature's module is actually implemented.

## Frontend stack

- **Routing:** `react-router` (data router / `createBrowserRouter`).
- **Server/backend data:** TanStack Query — for one-shot reads, Cloud
  Function callables, and any HTTP-style request.
- **Realtime Firestore data:** *not* TanStack Query. Realtime subscriptions
  (live cart, live auction bids, live notifications) are owned by a
  feature's own repository/service plus a dedicated hook wrapping
  `onSnapshot` directly, so there is exactly one owner of that live state.
- **Local/UI state:** Zustand (modal visibility, selected filters, cart-drawer
  open/closed).
- **React Context:** reserved for narrow, slowly-changing app-level concerns
  only (theme, current auth-session shape) — not a general state mechanism.
- **Forms/validation:** react-hook-form + zod, with the same zod schema
  duplicated server-side in the corresponding Cloud Function.
- **Styling:** Tailwind CSS (chosen over a full component library — MUI,
  Chakra, Ant — specifically to keep dev-server memory and bundle size low
  on the 8GB development laptop this project targets).

## Deferred architectural decisions

These are intentionally **not** decided in Module 00. Each is picked inside
the module that actually needs it, verified against current pricing/
availability at that time, and recorded in `ARTVAULT_PROJECT_STATE.md`:

- Cloud Functions runtime version (Node 20 vs Node 22).
- Payment provider (see `docs/DEPLOYMENT.md` and the payment module).
- AI provider behind the `AIProvider` interface (see `docs/AI_ARCHITECTURE.md`).
- Structured/full-text search provider, if Firestore-native filtering proves
  insufficient (see "Search" below).
- Enabling the Firebase Blaze billing plan, or any other paid service.

## Search (initial scope)

Marketplace search/filtering starts as Firestore-native structured queries
(category, tag `array-contains`, price range, sort by recency/price). No
external search provider (Algolia, Typesense, etc.) is selected in Module 00;
that decision is deferred until real query patterns demonstrate Firestore's
limits, and any paid provider requires explicit owner approval first.
