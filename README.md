# Scam Check

Paste an email or text, or add a photo of a bill or a screenshot: get ✅ Looks safe, ⚠️ Suspicious or 🚨 Likely scam, with the reasons and what to do.

Checks: known scam patterns, links (look-alike brands, domain age via RDAP, shorteners, risky endings, Google Safe Browsing), phone numbers (country, type, one-ring area codes), email sender (SPF/DKIM/DMARC, reply-to, mismatched links), and an AI analysis (Claude) for pictures, PDFs and unclear cases.

## Set up (Netlify)

1. Netlify → Add new site → Import from GitHub → `Scam-Check`. Build settings come from `netlify.toml`.
2. Site configuration → Environment variables:
   - `APP_ACCESS_TOKEN` (required): any long password; you type it once in the app.
   - `ANTHROPIC_API_KEY`: for the AI check (reads pictures/PDFs).
   - `AI_DAILY_LIMIT` (optional, default 20): most AI checks per day.
   - `GOOGLE_SAFE_BROWSING_KEY` (optional, free): Google Cloud → enable "Safe Browsing API" → create an API key.
3. Deploy, open the site, enter the access code.
