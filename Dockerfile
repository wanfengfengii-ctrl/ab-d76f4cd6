# syntax=docker/dockerfile:1

# ---- 依赖层 ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --cache /tmp/.npm --no-audit --no-fund

# ---- 构建/校验层：含开发依赖，供 verify 服务运行测试与冒烟 ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY tsconfig.json vite.config.ts index.html ./
COPY server.mjs ./server.mjs
COPY scripts ./scripts
COPY src ./src
RUN npm run build

# ---- 运行层：仅托管静态产物，健康检查只用 Node 内置能力 ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV HOST=0.0.0.0 \
    PORT=8080
COPY --from=builder /app/dist ./dist
COPY server.mjs ./server.mjs
COPY scripts/healthcheck.mjs ./scripts/healthcheck.mjs
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=5 \
  CMD node scripts/healthcheck.mjs
CMD ["node", "server.mjs"]
