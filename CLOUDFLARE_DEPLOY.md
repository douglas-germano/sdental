# Cloudflare Pages Deployment Guide (Dynamic/SSR)

## 1. Setup

Your frontend is configured for dynamic deployment using `@cloudflare/next-on-pages`. This supports Server-Side Rendering (SSR).

### Prerequisites
- Cloudflare Account
- GitHub Repository connected

## 2. Deploy via Cloudflare Dashboard (Recommended)

**IMPORTANT:** You must create a **Pages** project, not a Worker.

1.  Go to **Workers & Pages** > **Create Application**.
2.  Select **Pages** tab (Connect to Git).
3.  Connect your repository (`sdental`).
4.  Configure the build settings:
    *   **Project Name:** `sdental-frontend`
    *   **Framework Preset:** `Next.js` (if available, otherwise select "None")
    *   **Build Command:** `npm run pages:build`
    *   **Build Output Directory:** `.vercel/output/static`
5.  **Environment Variables:**
    *   `NEXT_PUBLIC_API_URL`: Your backend URL (e.g., `https://your-app.onrender.com`)
    *   `NODE_VERSION`: `20.10.0`
6.  **Compatibility Flags (Functions):**
    *   Go to **Settings** > **Functions** > **Compatibility Flags**.
    *   Add production flag: `nodejs_compat`
    *   Add preview flag: `nodejs_compat`

## 3. Deploy via CLI (Manual)

If you prefer using the terminal:

```bash
# Login
npx wrangler login

# Build
npm run pages:build

# Deploy
npx wrangler pages deploy .vercel/output/static --project-name sdental-frontend
```

## Troubleshooting Common Errors

### "Missing entry-point to Worker script"
**Cause:** You likely created a **Worker** project instead of a **Pages** project.
**Fix:** Delete the Worker project and create a new **Pages** project linked to your Git repo.

### "Edge Runtime" Error
**Cause:** Dynamic pages in Next.js on Cloudflare require Edge Runtime.
**Fix:** We already added `export const runtime = 'edge'` to your dynamic pages (`[slug]`, `[id]`). Ensure these changes are pushed.
