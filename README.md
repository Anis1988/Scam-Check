# Scam Check

Paste an email or text, or add a photo of a bill or a screenshot: get ✅ Looks safe, ⚠️ Suspicious or 🚨 Likely scam, with the reasons and what to do.

Checks: known scam patterns, links (look-alike brands, domain age via RDAP, shorteners, risky endings, Google Safe Browsing), phone numbers (country, type, one-ring area codes), email sender (SPF/DKIM/DMARC, reply-to, mismatched links), and an AI analysis (Claude) for pictures, PDFs and unclear cases.

## Set up (Vercel)

1. Vercel → Add New → Project → import `Scam-Check` from GitHub → Deploy. Settings come from `vercel.json` (Vite, output `build`).
2. Project → Storage → Create → **Upstash for Redis** (free) → connect it to the project. It adds `KV_REST_API_URL` / `KV_REST_API_TOKEN` (results cache + daily AI count).
3. Project → Settings → Environment Variables:
   - `APP_ACCESS_TOKEN` (required): any long password; you type it once in the app.
   - `ANTHROPIC_API_KEY`: for the AI check (reads pictures/PDFs).
   - `GEMINI_API_KEY` (optional, free): from aistudio.google.com → Get API key. Lets you pick a Gemini model (free) in Settings → AI model; it then checks everything.
   - `GROQ_API_KEY`, `OPENROUTER_API_KEY` (optional, free): more free AIs to pick in Settings → AI model (console.groq.com, openrouter.ai).
   - The 🎬 Video and 🏢 Look up tabs use the model picked in Settings, with a live web search (Gemini: Google Search; Claude: its web search; Groq: Compound). OpenRouter can't search.
   - `AI_DAILY_LIMIT` (optional, default 5): most AI checks per day. Only a starting value: the app's Settings tab wins (AI model, daily limit or unlimited, effort and more are all set there).
   - `GOOGLE_SAFE_BROWSING_KEY` (optional, free): Google Cloud → enable "Safe Browsing API" → create an API key.
4. Deployments → ⋯ → Redeploy (so the new variables are used), open the site, enter the access code.

## Run it on your computer

Needs Node.js 22.

```bash
git clone https://github.com/Anis1988/Scam-Check.git
cd Scam-Check
npm install
cp .env.example .env.local   # then open .env.local and fill in your keys
npm run dev                  # http://localhost:5173
```

`npm run dev` runs the screens and the server functions (`api/`) together, no Vercel needed. Without Upstash keys in `.env.local`, the AI counter and ⭐ Saved are kept in a local file (`.local/store.json`).
