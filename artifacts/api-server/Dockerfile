FROM node:20-alpine

# Install yt-dlp dependencies + ffmpeg
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    openssl

# Install yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Install pnpm globally
RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace root files needed for pnpm
COPY ../../package.json ../../pnpm-workspace.yaml ../../pnpm-lock.yaml ../../.npmrc ./

# Copy all workspace packages (needed for monorepo resolution)
COPY ../../artifacts/api-server ./artifacts/api-server
COPY ../../lib ./lib

# Install dependencies
RUN pnpm install --frozen-lockfile --filter "@workspace/api-server..."

# Build the API server
WORKDIR /app/artifacts/api-server
RUN pnpm run build

# Create downloads directory
RUN mkdir -p /app/artifacts/api-server/downloads

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV DOWNLOADS_DIR=/app/artifacts/api-server/downloads

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
