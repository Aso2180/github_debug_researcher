FROM node:20-slim AS server-deps
WORKDIR /app
# better-sqlite3 のネイティブビルドに必要(本番はpg経由でPostgreSQLを使うが、
# db/pool.js が両ドライバを静的importするためインストール自体は必須)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

# クライアントは「ホストで npm run build 済みの dist をCOPYする」のではなく、
# 必ずこのステージ内で npm ci && npm run build する。ビルド漏れが構造的に起きないようにするため
# (2026-07-09→07-10に古い dist が本番配信された事故の再発防止。HANDOFF.md 13章参照)。
FROM node:20-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY --from=client-build /app/client/dist ./client/dist
EXPOSE 3000
CMD ["node", "src/app.js"]
