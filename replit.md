# VidSnap — Universal Video Downloader

Download videos from YouTube, TikTok, Instagram, Facebook, Twitter/X, Snapchat, ShareChat, and 1000+ other platforms. Paste any link, pick a quality, and download.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/video-downloader run dev` — run the frontend (port 21720)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind CSS v4 + shadcn/ui + framer-motion
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Downloader: yt-dlp binary (./yt-dlp) — supports 1000+ sites
- Video editing: ffmpeg (system)
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)

## Where things live

- `yt-dlp` — binary at workspace root, used by the API server
- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/downloads.ts` — download_jobs table schema
- `artifacts/api-server/src/lib/downloader.ts` — yt-dlp + ffmpeg integration
- `artifacts/api-server/src/routes/video.ts` — all video API endpoints
- `artifacts/video-downloader/src/pages/` — Home, History, Editor, Platforms pages

## Architecture decisions

- yt-dlp binary is bundled at workspace root and referenced via `YTDLP_PATH` env var or `process.cwd()/yt-dlp`
- Downloads are stored as files in `./downloads/` directory, tracked by UUID in the DB
- Video editing (trim, speed, voice effects, watermark removal) uses ffmpeg filters
- Downloads run as background async processes; job status is polled from the frontend every 2s
- TikTok watermark removal crops bottom 8% of the video

## Product

- **Home**: Paste any URL → analyze formats/qualities → pick resolution → download
- **History**: See all download jobs with real-time progress tracking, retry failed jobs
- **Editor**: Trim, speed control, volume, voice effects (chipmunk/deep/robot/echo/telephone), format conversion
- **Platforms**: Grid of 20+ supported platforms with logos

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The yt-dlp binary must be executable: `chmod +x ./yt-dlp`
- ffmpeg must be available on the system PATH for downloads and edits
- Some platforms (Instagram, Facebook) may require cookies/auth for private content
- YouTube may rate-limit; the android+web extractor args help bypass bot-detection

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
