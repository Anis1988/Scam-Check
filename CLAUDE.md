# Working on this repo

- **Keep the Guide tab up to date.** Every change that adds or changes a user-visible feature must also update `src/pages/Guide.tsx` in the same commit: plain everyday words, and a live example built from the app's own components (made-up data, no working buttons).
- Push directly to `main` (the owner deploys from it via Vercel).
- Do not add automated tests unless asked.
- New features: describe them and get the owner's OK before building. Bug fixes can go straight in.
- Be very conservative with AI credit (the owner asked): by default ("ask") only photos/PDFs go to the AI automatically; texts/emails only when the owner taps "Ask the AI". Free checks first (patterns, links, phones, email sender); the paid AI always under the daily limit (default 5) (`AI_DAILY_LIMIT`, `server/store.ts`). The same message is never paid for twice (7-day result cache).
- The app only looks links up; it never opens or visits them. Message contents are not kept after a check (only the result, 7 days).
- Never let the AI turn a strong free warning into "Looks safe" (`server/merge.ts`).
- Phone-friendly is required: check a 390px-wide layout for any UI change.
- Hosting is Vercel: `api/*.ts` are the server functions (Web `GET`/`POST` handlers), `server/` the shared code, Upstash Redis the storage. Vercel's request limit is 4.5 MB (PDFs 3 MB max) and `api/ai.ts` may run 60 s (`vercel.json`).
- ⭐ Saved keeps only key facts (`api/saved.ts` → `keyFacts`), never the full message or picture.
- Local: `npm run dev` also serves `api/*.ts` (plugin in `vite.config.ts`, keys from `.env.local`); without Upstash keys it uses `server/localStore.ts` (`.local/store.json`). Keep `api/` handlers runnable both ways.
