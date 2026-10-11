# Hosted demo: backend (server/) and web app (frontend/) in one container.
# Deploy with: sh scripts/deploy_railway.sh (adds the git-ignored models as deploy-models/)
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm --prefix frontend ci --legacy-peer-deps

COPY . .
RUN npm run build && npm --prefix frontend run build

ENV NODE_ENV=production \
    SORA_API_UPSTREAM=http://127.0.0.1:3001 \
    SORA_MODELS_DIR=/app/deploy-models

# The backend stays inside the container on 3001; the web app takes Railway's $PORT
CMD ["sh", "-c", "PORT=3001 HOST=127.0.0.1 node dist-server/index.js & exec node frontend/.output/server/index.mjs"]
