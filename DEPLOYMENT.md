# VidSnap Deployment: Vercel + Render

This repo is set up for:

- **Frontend** (`video-downloader`) → Vercel
- **Admin Panel** (`admin-panel`) → Vercel (separate project)
- **API/Backend** (`api-server`) → Render (Docker)

---

## 1. Push Code To GitHub

Both Vercel and Render deploy from a Git repo. Push this project root:

```bash
git add .
git commit -m "Configure Vercel and Render deployment"
git push
```

---

## 2. Deploy Backend On Render

1. Open [render.com](https://render.com) → Login with GitHub
2. Click **New +** → **Blueprint**
3. Select this GitHub repo
4. Render will auto-detect `render.yaml`
5. When Render asks for secret values, set:

```env
APP_URL=https://your-vercel-app.vercel.app
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,https://your-admin.vercel.app
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
```

`JWT_SECRET` is generated automatically by Render.

6. Click **Apply** → Wait 10-15 min for Docker build
7. Test: `https://vidsnap-api.onrender.com/api/health` → should return `{ "status": "ok" }`

> **If Vercel is not deployed yet**, use `ALLOWED_ORIGINS=*` temporarily. Update after Vercel is live.

---

## 3. Deploy Frontend On Vercel

1. Open [vercel.com](https://vercel.com) → Login with GitHub
2. Click **Add New Project** → Import your GitHub repo
3. Settings:
   - **Root Directory**: `/` (leave as repo root, do NOT change)
   - **Framework**: Vite (auto-detected)
   - Everything else is in `vercel.json` — no manual changes needed
4. Click **Deploy** → Done in 2-3 min

Your frontend URL: `https://vidsnap-xyz.vercel.app`

---

## 4. Deploy Admin Panel On Vercel (Separate Project)

The admin panel is a single HTML file in `artifacts/admin-panel/`.

1. Go to Vercel → **Add New Project** → Import the **same GitHub repo**
2. Settings:
   - **Root Directory**: `/` (leave as repo root)
   - **Framework Preset**: Other (it's a static site)
   - **Build Command**: *(leave empty)*
   - **Output Directory**: `artifacts/admin-panel`
3. Before deploying, go to **Settings → Git → Root Directory** and make sure you set the Vercel config file to `vercel-admin.json`:
   - In Vercel project settings → Go to **Settings → General**
   - Under **Vercel Config File** put: `vercel-admin.json`
4. Click **Deploy**

Your admin URL: `https://vidsnap-admin-xyz.vercel.app`

---

## 5. Connect Vercel To Render

After Render is live, check `vercel.json` and `vercel-admin.json`:

```json
"destination": "https://vidsnap-api.onrender.com/api/:match*"
```

If your Render URL is different, replace only the host in both files, then redeploy both Vercel projects.

---

## 6. Final Render Env Update

After both Vercel projects give you real URLs, update Render env vars:

```env
APP_URL=https://vidsnap-xyz.vercel.app
ALLOWED_ORIGINS=https://vidsnap-xyz.vercel.app,https://vidsnap-admin-xyz.vercel.app
```

Go to Render → `vidsnap-api` → **Environment** tab → Update → **Save Changes** → Auto-redeploys.

---

## Architecture Overview

```
GitHub Repo (same repo, different parts)
         │
         ├── Vercel (Frontend)
         │     reads: vercel.json
         │     builds: artifacts/video-downloader
         │     URL: vidsnap.vercel.app
         │
         ├── Vercel (Admin Panel)
         │     reads: vercel-admin.json
         │     serves: artifacts/admin-panel/index.html
         │     URL: vidsnap-admin.vercel.app
         │
         └── Render (Backend API)
               reads: render.yaml → Dockerfile
               runs: artifacts/api-server
               URL: vidsnap-api.onrender.com

Frontend & Admin → /api/* requests → proxied to Render API
```

---

## Notes

- Render persistent disk is mounted at `/app/persist`
- SQLite database lives at `/app/persist/data`
- Downloads live at `/app/persist/downloads`
- Uploads live at `/app/persist/uploads`
- SMTP is required for OTP/password reset email
- `yt-dlp` binary is downloaded inside Docker at build time on Render (not committed to Git)
