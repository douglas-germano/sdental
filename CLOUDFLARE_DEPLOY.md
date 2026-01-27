# Cloudflare Pages Deployment Guide (Dynamic/SSR)

## 1. Setup

Your frontend is configured for dynamic deployment using `@cloudflare/next-on-pages`. This supports Server-Side Rendering (SSR).

### Prerequisites
- Cloudflare Account
- Wrangler installed (`npm install -g wrangler`)

## 2. Deploy

Run these commands in the `frontend` directory:

```bash
# Login
npx wrangler login

# Build for Cloudflare Pages
npm run pages:build

# Deploy the output directory (.vercel/output/static is used by pages, but next-on-pages handles the transform)
# Actually, @cloudflare/next-on-pages outputs to the '.vercel/output/static' folder structure compatible with Pages? 
# No, it usually outputs to a specific directory or you deploy via git integration.
# For manual deploy with wrangler:

npx wrangler pages deploy .vercel/output/static --project-name sdental-frontend
```

**Note:** The command above might need adjustment depending on exact output structure. If using Git integration (recommended):
1. Push your code to GitHub.
2. Go to Cloudflare Dashboard > Pages > Connect to Git.
3. Select repo `sdental`.
4. **Build Command:** `npx @cloudflare/next-on-pages`
5. **Build Output Directory:** `.vercel/output/static`
6. **Node.js Compatibility:** Enable Node.js compatibility flag if needed (Settings > Functions > Compatibility Flags > `nodejs_compat`).

## 3. Environment Variables

Add your variables in the Cloudflare Dashboard (Settings > Environment Variables):

- `NEXT_PUBLIC_API_URL`: Your backend URL (e.g., `https://your-backend.onrender.com`)
- `NODE_VERSION`: `20.10.0` (or similar)
