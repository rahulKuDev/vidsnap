# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Minimal build tools — node:22-alpine already has most things
RUN apk add --no-cache python3 make g++

RUN npm install -g pnpm@10

WORKDIR /app

# Copy workspace manifests first (better Docker layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./

# Copy the API package and shared workspace packages
COPY artifacts/api-server ./artifacts/api-server
COPY lib ./lib

# Install only backend workspace graph
RUN pnpm install --frozen-lockfile --filter "@workspace/api-server..." || \
    pnpm install --no-frozen-lockfile --filter "@workspace/api-server..."

WORKDIR /app/artifacts/api-server
RUN pnpm run build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Install runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    curl \
    ca-certificates \
    python3

# Install latest stable yt-dlp
RUN curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && yt-dlp --version

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/api-server/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Create required temp directories
RUN mkdir -p /tmp/downloads /tmp/uploads /tmp/data /tmp/vidsnap-cookies

# Environment defaults (Railway overrides PORT automatically)
ENV NODE_ENV=production
ENV PORT=8080
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV DOWNLOADS_DIR=/tmp/downloads
ENV UPLOADS_DIR=/tmp/uploads
ENV DB_DIR=/tmp/data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=15s --start-period=90s --retries=3 \
  CMD curl -f "http://localhost:${PORT:-8080}/api/health" || exit 1

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
