# Next.js 16 Migration Assessment (`business-os`)

- Upgraded `next` (`15.5.29` -> `16.4.6`), `eslint-config-next` (`15.5.9` -> `16.4.6`), and `eslint` (`8.57.1` -> `^9.39.5`).
- Verified `npx tsc --noEmit` (0 errors) and `npm run build` (all 16 routes compiled cleanly).
- Remaining migration items before merging to `master`:
  1. Replace deprecated `next lint` script with ESLint 9 flat config (`eslint.config.mjs` + `eslint .`).
  2. Validate runtime behavior across all server actions & auth flows in Vercel Preview (`middleware.ts` -> `proxy.ts` deprecation warning in Next 16).
