# Working on this repo

- **Keep the Guide tab up to date.** Every change that adds or changes a user-visible feature must also update `src/pages/Guide.tsx` in the same commit: plain everyday words, and a live example built from the app's own components (made-up data, no working buttons).
- Push directly to `main` (the owner deploys from it via Vercel).
- Do not add automated tests unless asked.
- New features: describe them and get the owner's OK before building. Bug fixes can go straight in.
- Free checks first (patterns, links, phones, email sender); the paid AI only when useful, always under the daily limit (`AI_DAILY_LIMIT`, `server/store.ts`). The same message is never paid for twice (7-day result cache).
- The app only looks links up; it never opens or visits them. Message contents are not kept after a check (only the result, 7 days).
- Never let the AI turn a strong free warning into "Looks safe" (`server/merge.ts`).
- Phone-friendly is required: check a 390px-wide layout for any UI change.
- Hosting is Vercel: `api/*.ts` are the server functions (Web `GET`/`POST` handlers), `server/` the shared code, Upstash Redis the storage. Vercel's request limit is 4.5 MB (PDFs 3 MB max) and `api/ai.ts` may run 60 s (`vercel.json`).
