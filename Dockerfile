# ---------- 前端构建 ----------
FROM node:20-bookworm AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---------- 后端构建（完整镜像自带 python3/make/g++，可编译 better-sqlite3） ----------
FROM node:20-bookworm AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# ---------- 运行时 ----------
FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=server-build /app/server/node_modules ./server/node_modules
COPY --from=server-build /app/server/dist ./server/dist
COPY server/package.json ./server/package.json
COPY --from=client-build /app/client/dist ./client/dist
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
