# VidSnap — Universal Video Downloader

A full-stack web application for downloading videos from 1,000+ websites including YouTube, Instagram, TikTok, Twitter/X, Facebook, Vimeo, Reddit, and many more.

## ✨ Features

- **Universal Downloader** — Supports 1,000+ video platforms
- **Multiple Formats** — MP4, WebM, MP3, and more
- **Quality Selection** — 4K, 1080p, 720p, 480p, 360p
- **Auth System** — Secure JWT-based registration/login with email OTP verification
- **Profile Page** — Avatar upload, name editing, password change
- **Download History** — Track and manage all your downloads
- **Video Editor** — Trim, crop, and process downloaded videos
- **Admin Panel** — User management, ticket system, error log (admin role only)
- **Responsive Design** — Works on desktop and mobile

## 🛠️ Tech Stack

**Frontend**
- React 19 + TypeScript
- Vite + TailwindCSS v4
- Framer Motion (animations)
- Wouter (routing)
- TanStack Query (data fetching)
- Shadcn/ui components

**Backend**
- Node.js + Express 5
- SQLite (node:sqlite — no external DB needed)
- JWT authentication
- Bcrypt password hashing
- Nodemailer (email OTP)
- Multer (file uploads)
- yt-dlp / Playwright (video extraction)

## 🚀 Getting Started

### Prerequisites
- Node.js 22+
- pnpm 10+

```bash
npm install -g pnpm
```

### Installation

```bash
# Clone the repo
git clone https://github.com/rahulKuDev/vidsnap.git
cd vidsnap

# Install all dependencies
pnpm install
```

### Environment Variables

Create `artifacts/api-server/.env`:

```env
PORT=8080
JWT_SECRET=your-super-secret-jwt-key-change-this

# Email (for OTP verification)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=VidSnap <your-email@gmail.com>
```

### Running Locally

**Terminal 1 — API Server:**
```bash
cd artifacts/api-server
pnpm dev
# Runs on http://localhost:8080
```

**Terminal 2 — Frontend:**
```bash
cd artifacts/video-downloader
PORT=5173 BASE_PATH=/ pnpm dev
# Runs on http://localhost:5173
```

Then open [http://localhost:5173](http://localhost:5173)

### Building for Production

```bash
# Build everything
pnpm build

# Frontend output: artifacts/video-downloader/dist/public
# API server output: artifacts/api-server/dist/index.mjs
```

## 📁 Project Structure

```
vidsnap/
├── artifacts/
│   ├── api-server/          # Express backend
│   │   ├── src/
│   │   │   ├── routes/      # API route handlers
│   │   │   ├── lib/         # DB, auth middleware, logger
│   │   │   └── index.ts     # Server entry point
│   │   └── data/            # SQLite database (auto-created)
│   │
│   └── video-downloader/    # React frontend
│       └── src/
│           ├── pages/       # Route pages
│           ├── components/  # UI components
│           ├── context/     # Auth context
│           └── App.tsx      # Root router
│
└── lib/                     # Shared libraries
    ├── api-client-react/    # Auto-generated API client hooks
    └── api-zod/             # Shared Zod schemas
```

## 🔐 Admin Access

To grant admin access, update the user's role in the SQLite database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```

The Admin Panel is visible in the **Help** page for admin users.

## 📄 License

MIT — see [LICENSE](LICENSE)
