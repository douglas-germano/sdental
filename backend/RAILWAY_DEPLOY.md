# SDental Backend - Railway Deployment Guide

## Environment Variables

Configure the following environment variables in Railway:

### Database
```
DATABASE_URL=<Railway PostgreSQL URL>
```
Railway will automatically provide this if you add a PostgreSQL service.

### Flask Configuration
```
FLASK_ENV=production
SECRET_KEY=<generate-a-secure-random-key>
JWT_SECRET_KEY=<generate-a-secure-random-key>
```

### AI Provider (OpenRouter)
```
OPENROUTER_API_KEY=<your-openrouter-api-key>
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
```

### Evolution API (WhatsApp)
```
EVOLUTION_API_URL=<your-evolution-api-url>
EVOLUTION_API_KEY=<your-evolution-api-key>
```

## Deployment Steps

### 1. Create New Railway Project
1. Go to [Railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose `douglas-germano/sdental`
5. Select the `backend` directory as root

### 2. Add PostgreSQL Database
1. Click "New" → "Database" → "Add PostgreSQL"
2. Railway will automatically set `DATABASE_URL`

### 3. Configure Environment Variables
1. Click on your service → "Variables"
2. Add all the environment variables listed above
3. Use the "Raw Editor" for bulk paste if needed

### 4. Set Root Directory
1. Go to Settings → "Root Directory"
2. Set to: `/backend`
3. Set "Railway Config File" to `/backend/railway.json`. The config path is
   relative to the repository root, independently of Root Directory.

### 5. Deploy
Railway will automatically:
- Install dependencies from `requirements.txt`
- Run `start.sh` which:
  - Creates the current model schema and stamps the migration head **only if
    the database has no application tables and no applied Alembic revisions**
  - Runs database migrations (`flask --app run:app db upgrade`)
  - Stops on initialization or migration errors instead of serving a broken schema
  - Starts Gunicorn server

Database preparation disables background jobs; the scheduler starts with the web
workers according to `ENABLE_SCHEDULER`. Schema creation and stamping share a
PostgreSQL transaction. Existing databases are never stamped by the bootstrap;
they keep the normal migration path.

### 6. Custom Domain (Optional)
1. Go to Settings → "Domains"
2. Add your custom domain or use Railway subdomain

## Generating Secret Keys

Run this in Python to generate secure keys:
```python
import secrets
print(secrets.token_urlsafe(32))
```

## Health Check

After deployment, test:
```bash
curl https://your-app.railway.app/api/health
```

Should return HTTP 200 with `"status": "healthy"` and a timestamp. Use
`/api/health/ready` to also verify database connectivity.

## Updating Evolution Webhook

After deployment, update your Evolution API webhook to point to:
```
https://your-app.railway.app/api/webhook/evolution
```

## Monitoring

Check logs in Railway dashboard:
- Build logs: See if deployment succeeded
- Deploy logs: See application startup
- App logs: Runtime logs from your Flask app

## Troubleshooting

### Migration Errors
The legacy first migration alters `clinics` without creating the initial tables.
For an empty database, `bootstrap_database.py` creates the current schema before
the upgrade, following [Alembic's fresh-database recipe](https://alembic.sqlalchemy.org/en/latest/cookbook.html#building-an-up-to-date-database-from-scratch).
An empty `alembic_version` table left by a failed first migration is supported.
If the database already has application tables or applied revisions, bootstrap
does nothing; inspect the failing migration rather than stamping it manually.

If migrations fail, you can run them manually:
```bash
railway run flask db upgrade
```

### Environment Variables Not Loading
Make sure `.env` is in `.gitignore` and all variables are set in Railway dashboard.

### CORS Issues
The app is configured to allow all origins in development. For production, update `app/__init__.py`:
```python
CORS(app, resources={r"/api/*": {"origins": "https://your-frontend-domain.com"}})
```
