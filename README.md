# VidSnap - Universal Video Downloader

VidSnap is a full-stack web app for downloading videos from 1,000+ websites including YouTube, Instagram, TikTok, Twitter/X, Facebook, Vimeo, Reddit, and many more.

## Features

- Universal downloader for 1,000+ video platforms
- MP4, WebM, MP3, MKV, M4A, FLAC, and WAV workflows
- Quality selection up to 4K where the source supports it
- JWT auth with email OTP verification
- Profile page with avatar upload, name editing, and password changes
- Download history and job tracking
- Browser-side video editor
- Admin panel for users, tickets, and error logs
- Responsive React UI

## Tech Stack

Frontend:

- React 19 + TypeScript
- Vite + Tailwind CSS
- TanStack Query
- Wouter
- Framer Motion
- shadcn/ui style components

Backend:

- Node.js 22 + Express 5
- SQLite via `node:sqlite`
- JWT authentication
- Nodemailer for OTP and password reset email
- Multer uploads
- `yt-dlp` and FFmpeg for video processing

## Local Setup

Prerequisites:

- Node.js 22+
- pnpm 10+

```bash
npm install -g pnpm
pnpm install
```

Create `artifacts/api-server/.env`:

```env
PORT=8080
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-this
APP_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM_NAME=VidSnap
```

Run API:

```bash
cd artifacts/api-server
pnpm dev
```

Run frontend:

```bash
cd artifacts/video-downloader
pnpm dev
```

Open `http://localhost:5173`.

## Production Build

```bash
pnpm build
```

Outputs:

- Frontend: `artifacts/video-downloader/dist/public`
- API: `artifacts/api-server/dist/index.mjs`

## Deployment

This repo is configured for Vercel + Render:

- `vercel.json` deploys the frontend from the repo root and proxies `/api/*` to Render.
- `render.yaml` deploys the backend as a Docker web service on Render.
- `.env.example` lists the production environment variables.
- Railway config has been removed.

Full step-by-step instructions are in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Admin Access

The first registered user becomes admin automatically. To grant admin later, update SQLite:

```sql
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```

## License

MIT
