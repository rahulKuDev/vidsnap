# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Build tools needed for native addons
RUN apk add --no-cache python3 make g++ curl ca-certificates openssl

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

# Install ffmpeg, yt-dlp, and all required tools
RUN apk add --no-cache \
    python3 \
    ffmpeg \
    curl \
    wget \
    ca-certificates \
    openssl \
    tzdata \
    # Required for yt-dlp on some platforms
    py3-pip \
    atomicparsley

# Install latest yt-dlp binary (pinned to stable release)
RUN curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && yt-dlp --version

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/api-server/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Create required directories (using /tmp — ephemeral, no persistent disk needed)
RUN mkdir -p /tmp/downloads /tmp/uploads /tmp/data /tmp/vidsnap-cookies

# ─── Environment Defaults ─────────────────────────────────────────────────────
ENV NODE_ENV=production
# PORT is set by Railway automatically — default 8080 if not set
ENV PORT=8080
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV DOWNLOADS_DIR=/tmp/downloads
ENV UPLOADS_DIR=/tmp/uploads
ENV DB_DIR=/tmp/data

# Railway uses dynamic ports — expose via env
EXPOSE ${PORT}

# Health check — Railway uses this to verify the service is healthy
HEALTHCHECK --interval=30s --timeout=15s --start-period=90s --retries=3 \
  CMD curl -f "http://localhost:${PORT:-8080}/api/health" || exit 1

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
