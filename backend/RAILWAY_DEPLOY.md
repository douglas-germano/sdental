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

### Claude AI API
```
CLAUDE_API_KEY=<your-anthropic-api-key>
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
2. Set to: `backend`

### 5. Deploy
Railway will automatically:
- Install dependencies from `requirements.txt`
- Run `start.sh` which:
  - Runs database migrations (`flask db upgrade`)
  - Starts Gunicorn server

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
curl https://your-app.railway.app/health
```

Should return: `{"status": "healthy"}`

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
