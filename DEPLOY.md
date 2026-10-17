# Deploying Persona Intelligence from a phone

Persona Intelligence goes live on **Vercel** (hosting), backed by its **own Supabase project** (accounts and database). Everything below can be done in Safari on an iPhone. It never touches Flash Luz: Persona Intelligence lives in its own GitHub repository, Vercel project and Supabase project.

Costs: steps 1–4 are free (Vercel Hobby, Supabase Free, Tavily Free). Step 5, AI analysis, needs paid OpenAI credits, so only do it if you decide to.

Type API keys **only** into Vercel's environment-variable screen. Never paste them into chat, code or GitHub.

---

## 1. GitHub: an empty repository for Persona Intelligence (1 minute)

1. Open **github.com/new**.
2. Owner: `flashluzil-stack`. Repository name: `persona-intelligence`. Choose **Private**. Leave “Add a README” **unticked**.
3. Tap **Create repository**.
4. If the Claude GitHub app only has access to selected repositories, add this one: **github.com/settings/installations** → *Claude* → **Configure** → *Repository access* → add `persona-intelligence` → **Save**.

Claude then pushes the app into this repository. The app sits at the repository root, so Vercel needs no special settings.

## 2. Vercel: put the site online (3 minutes, free)

1. Open **vercel.com/signup** → choose **Hobby** → **Continue with GitHub**.
2. When Vercel asks to install its GitHub app, choose **Only select repositories** → `persona-intelligence`. **Do not** select `flashluz`.
3. **Add New… → Project** → **Import** next to `persona-intelligence`.
4. Leave every setting as detected (Framework: Next.js, Root Directory: `./`). Add no environment variables yet. Tap **Deploy**.
5. When it finishes, tap **Continue to Dashboard** → **Visit**. Your address looks like `https://persona-intelligence-xxxx.vercel.app`.

At this point the site is live in **demo mode**: home page, fictional sample profile and brief, and the privacy page. Check `https://<your-domain>/api/health` to see which features are switched on. It never shows keys.

> If the deployment fails with a message about `maxDuration`: open **Settings → Functions**, turn on **Fluid Compute**, then **Deployments → ⋯ → Redeploy**.

## 3. Supabase: accounts and database (5 minutes, free)

1. In your Vercel project: **Storage** tab (or **Integrations → Browse Marketplace**) → **Supabase** → **Create**.
2. Choose the **Free** plan and a region near you. Name the database `persona-intelligence`. Create it, then connect it to the `persona-intelligence` project (all environments).
   This creates a **new, separate** Supabase project and adds its settings (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `POSTGRES_URL_NON_POOLING`, …) to Vercel automatically.
3. In Vercel: **Settings → Environment Variables → Add**:
   - Key `PERSONA_MIGRATE_ON_BUILD`, Value `true`, all environments → **Save**.
   This lets each build create or update Persona Intelligence's tables in that database. It refuses to run against a database that already holds another application's tables.
4. **Deployments → ⋯ (latest) → Redeploy.** In the build log you should see `[migrate] applied 20261017000000_initial_schema.sql`.
5. Open the Supabase dashboard (the link from Vercel's Storage tab) → **Authentication → URL Configuration**:
   - **Site URL:** `https://<your-domain>`
   - **Redirect URLs → Add URL:** `https://<your-domain>/auth/callback`
6. Email confirmation: Supabase's built-in email only delivers to your own Supabase team email, and only a few emails per hour. Create your first account with that email address. For other testers, either set up custom SMTP in Supabase, or, for private testing only, turn off **Authentication → Sign In / Providers → Email → Confirm email**.

You can now create an account, sign in, and see the dashboard, settings, data export and account deletion. Research still needs search, and analysis needs AI.

## 4. Live web search (free tier)

1. Sign up at **app.tavily.com** (free plan, no card at the time of writing, about 1,000 searches per month) and copy your API key.
2. In Vercel: **Settings → Environment Variables → Add**:
   - `TAVILY_API_KEY` = your key, **Sensitive** ticked, Production and Preview.
   - `SEARCH_PROVIDER` = `tavily`
3. **Redeploy.**

Research now finds and stores real public sources and lets you confirm the person's identity. Without AI, research ends as “Partially completed”: sources are collected, but no claims or profile are generated.

(Brave Search also works: set `BRAVE_SEARCH_API_KEY` instead. Brave requires a card even on its free plan.)

## 5. AI analysis (paid; approve before doing this)

Claims, profiles and meeting briefs need an OpenAI key, which requires **prepaid credits** on platform.openai.com (the minimum top-up is a few dollars).

1. At **platform.openai.com**: **Settings → Billing**, add credits, and set a monthly **usage limit** (for example $5).
2. **API keys → Create new secret key**, then copy it.
3. In Vercel: add `OPENAI_API_KEY` (Sensitive). Optionally add `OPENAI_MODEL` (default `gpt-5-mini`). Then **Redeploy**.

Each research run makes at most `RESEARCH_MAX_AI_CALLS` model calls (default 8; usually 3). Daily research quota per user: `RESEARCH_DAILY_QUOTA` (default 10).

## Checking it works

| Check | Expected |
| --- | --- |
| `/` and `/demo` on your iPhone | Pages load. The demo is clearly labelled “Fictional demo”. |
| `/api/health` | `{"ok":true,"mode":…}`, with `auth`, `search` and `ai` true once configured |
| Create account → dashboard | Badge in the header shows the configured mode |
| Research “Full name + company” | Workspace shows stages progressing. The profile appears when it completes (with AI) |

## Notes

- Vercel's Hobby plan is for personal, non-commercial use. A paying-customer launch needs Vercel Pro.
- Research runs in the background for up to 5 minutes per job (`RESEARCH_JOB_TIMEOUT_MS`, default 4 minutes).
- Updating: every push to the `persona-intelligence` repository's `main` branch redeploys automatically.
