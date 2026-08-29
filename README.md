# ArtVault

Production-oriented, real-time, AI-powered art marketplace web app.
React + TypeScript + Vite, with Firebase (Auth, Firestore, Storage, Cloud
Functions) as the planned backend.

Project status, completed/pending modules, and architecture decisions are
tracked in [`ARTVAULT_PROJECT_STATE.md`](./ARTVAULT_PROJECT_STATE.md).
Detailed designs live under [`docs/`](./docs):

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/DATABASE.md`](./docs/DATABASE.md)
- [`docs/SECURITY.md`](./docs/SECURITY.md)
- [`docs/AI_ARCHITECTURE.md`](./docs/AI_ARCHITECTURE.md)
- [`docs/AUCTION_ARCHITECTURE.md`](./docs/AUCTION_ARCHITECTURE.md)
- [`docs/AR_ARCHITECTURE.md`](./docs/AR_ARCHITECTURE.md)
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)

## Local development

```bash
npm install
npm run dev
```

No Firebase account or billing plan is required for local development —
see `docs/DEPLOYMENT.md` for why.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — typecheck (`tsc -b`) and build
- `npm run typecheck` — typecheck only
- `npm run lint` — Oxlint
- `npm run test -- --run` — run the test suite once (omit `-- --run` for watch mode)
- `npm run preview` — preview the production build
