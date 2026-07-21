# Stage 1: Build
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++ curl ca-certificates openssl
RUN npm install -g pnpm@10

WORKDIR /app

# Copy workspace manifests first for better Docker layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./

# Copy the API package and shared workspace packages.
COPY artifacts/api-server ./artifacts/api-server
COPY lib ./lib

# Install only the backend workspace graph. Fallback keeps deploys moving if the
# lockfile is slightly out of date, but frozen lockfile is attempted first.
RUN pnpm install --frozen-lockfile --filter "@workspace/api-server..." || \
    pnpm install --no-frozen-lockfile --filter "@workspace/api-server..."

WORKDIR /app/artifacts/api-server
RUN pnpm run build

# Stage 2: Runtime
FROM node:22-alpine AS runtime

RUN apk add --no-cache python3 ffmpeg curl ca-certificates openssl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/api-server/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /app/downloads /app/uploads /app/data /app/persist

ENV NODE_ENV=production
ENV PORT=8080
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV DOWNLOADS_DIR=/app/downloads
ENV UPLOADS_DIR=/app/uploads
ENV DB_DIR=/app/data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f "http://localhost:${PORT:-8080}/api/health" || exit 1

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
