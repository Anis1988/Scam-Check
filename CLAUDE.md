# Working on this repo

- **Keep the Guide tab up to date.** Every change that adds or changes a user-visible feature must also update `src/pages/Guide.tsx` in the same commit: plain everyday words, and a live example built from the app's own components (made-up data, no working buttons).
- Push directly to `main` (the owner deploys from it via Vercel).
- Do not add automated tests unless asked.
- New features: describe them and get the owner's OK before building. Bug fixes can go straight in.
- Be very conservative with AI credit (the owner asked): by default ("ask") only photos/PDFs go to the AI automatically; texts/emails only when the owner taps "Ask the AI". Free checks first (patterns, links, phones, email sender); the paid AI always under the daily limit (default 5) (`AI_DAILY_LIMIT`, `server/store.ts`). The same message is never paid for twice (7-day result cache).
- The app only looks links up; it never opens or visits them. Message contents are not kept after a check (only the result, 7 days), unless the owner saves it with "Keep the original".
- Never let the AI turn a strong free warning into "Looks safe" (`server/merge.ts`).
- Phone-friendly is required: check a 390px-wide layout for any UI change.
- Hosting is Vercel: `api/*.ts` are the server functions (Web `GET`/`POST` handlers), `server/` the shared code, Upstash Redis the storage. Vercel's request limit is 4.5 MB (PDFs 3 MB max) and `api/ai.ts` may run 60 s (`vercel.json`).
- ⭐ Saved keeps the key facts (`api/saved.ts` → `keyFacts`), plus the original message and picture/PDF only when "Keep the original" is ticked (owner's request); files are in Redis `sc:file:<id>`, viewable/downloadable/deletable, and removed by the automatic clean-up (Settings).
- Local: `npm run dev` also serves `api/*.ts` (plugin in `vite.config.ts`, keys from `.env.local`); without Upstash keys it uses `server/localStore.ts` (`.local/store.json`). Keep `api/` handlers runnable both ways.
- Server imports must end in `.js` (`../server/guard.js`): Vercel runs `api/` as plain Node ESM without bundling, and Node needs the extension.
- Look: "Light & calm" (muted teal/coral palette in `tailwind.config.js`), tabs with icons at the top, wide layouts on big screens. Keep it clearly different from the owner's other (dark) apps, and no scary examples in the Guide.
