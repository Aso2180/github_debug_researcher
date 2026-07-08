FROM node:20-slim AS build
WORKDIR /app
# better-sqlite3 のネイティブビルドに必要(本番はpg経由でPostgreSQLを使うが、
# db/pool.js が両ドライバを静的importするためインストール自体は必須)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY client/dist ./client/dist
EXPOSE 3000
CMD ["node", "src/app.js"]
