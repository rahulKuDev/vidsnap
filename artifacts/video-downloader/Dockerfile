# ─── Stage 1: Build frontend ─────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm@10

WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./

# Copy frontend + shared lib packages
COPY artifacts/video-downloader ./artifacts/video-downloader
COPY lib ./lib

# Install deps
RUN pnpm install --frozen-lockfile --filter "@workspace/video-downloader..." || \
    pnpm install --no-frozen-lockfile --filter "@workspace/video-downloader..."

# Build with production env
WORKDIR /app/artifacts/video-downloader
ARG VITE_API_URL=""
ENV PORT=3000
ENV BASE_PATH=/
RUN pnpm run build

# ─── Stage 2: Serve with nginx ────────────────────────────────────────────────
FROM nginx:alpine AS runtime

# Copy built files
COPY --from=builder /app/artifacts/video-downloader/dist/public /usr/share/nginx/html

# Nginx config: handle SPA routing (redirect all to index.html)
RUN printf 'server {\n\
  listen 8080;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  gzip on;\n\
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
  location /api/ {\n\
    proxy_pass http://api:8080;\n\
    proxy_set_header Host $host;\n\
    proxy_set_header X-Real-IP $remote_addr;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
