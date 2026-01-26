# SDental Backend - Render Deployment Guide

## Quick Deploy

### Option 1: Using render.yaml (Blueprint)
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New" → "Blueprint"
3. Connect your GitHub repository: `douglas-germano/sdental`
4. Render will automatically detect `render.yaml`
5. Click "Apply" to deploy

The `render.yaml` file will automatically:
- Create PostgreSQL database
- Deploy the backend service
- Run migrations on build
- Generate secure SECRET_KEY and JWT_SECRET_KEY
- Connect database to backend

### Option 2: Manual Deployment
If you prefer manual setup:

#### 1. Create PostgreSQL Database
1. Click "New" → "PostgreSQL"
2. Name: `sdental-db`
3. Database Name: `sdental`
4. User: `sdental`
5. Click "Create Database"

#### 2. Create Web Service
1. Click "New" → "Web Service"
2. Connect repository: `douglas-germano/sdental`
3. Configure:
   - **Name**: `sdental-backend`
   - **Region**: Oregon (or nearest)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt && flask db upgrade`
   - **Start Command**: `gunicorn -w 4 -b 0.0.0.0:$PORT run:app`

## Environment Variables

After deployment, add these environment variables in the Render dashboard:

### Required Variables
```
DATABASE_URL=<automatically set from database>
```

### Generate New Secret Keys
Run in Python locally:
```python
import secrets
print(secrets.token_urlsafe(32))
```

Then add to Render:
```
SECRET_KEY=<generated-secret>
JWT_SECRET_KEY=<generated-secret>
```

### API Keys
```
CLAUDE_API_KEY=sk-ant-your-actual-key
EVOLUTION_API_URL=https://your-evolution-api.com
EVOLUTION_API_KEY=your-evolution-key
```

### Optional
```
FLASK_ENV=production
```

## Post-Deployment

### 1. Verify Health
Visit: `https://your-app.onrender.com/health`

Should return: `{"status": "healthy"}`

### 2. Update Evolution Webhook
Configure your Evolution API webhook to:
```
https://your-app.onrender.com/api/webhook/evolution
```

### 3. Update Frontend
Update your frontend's API URL to point to:
```
https://your-app.onrender.com
```

## Important Notes

### Free Tier Limitations
- Apps spin down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- Database has 90-day retention
- Limited to 750 hours/month

### Database Connection
Render automatically sets `DATABASE_URL` with internal connection string.

### Migrations
Migrations run automatically during build (`flask db upgrade` in build command).

To run migrations manually:
```bash
# In Render Shell
flask db upgrade
```

### Logs
Access logs in Render Dashboard → Your Service → Logs

### Custom Domain
1. Go to Settings → Custom Domains
2. Add your domain
3. Configure DNS with provided CNAME

## Troubleshooting

### Build Fails
- Check Build Logs in Render dashboard
- Verify `requirements.txt` has all dependencies
- Ensure Python version compatibility

### Migration Errors
If migrations fail during build:
1. Remove `flask db upgrade` from build command temporarily
2. Deploy
3. Run migration manually in Render Shell:
   ```bash
   flask db upgrade
   ```
4. Add migration back to build command

### App Won't Start
- Check that `run.py` exists and exports `app`
- Verify gunicorn is in `requirements.txt`
- Check environment variables are set

### Database Connection Issues
- Verify `DATABASE_URL` is set
- Check database is running in same region
- Try restarting the web service

## Updating the App

Push to GitHub `main` branch:
```bash
git push origin main
```

Render auto-deploys on every push to `main`.

## Scaling

To handle more traffic, upgrade from Free tier:
1. Settings → Instance Type
2. Choose Starter ($7/mo) or higher
3. Increase worker count in start command:
   ```
   gunicorn -w 8 -b 0.0.0.0:$PORT run:app
   ```

## Monitoring

### Health Checks
Render automatically monitors `/health` endpoint.

### Metrics
Available in Dashboard → Metrics:
- CPU usage
- Memory usage
- Request count
- Response time
