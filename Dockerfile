# syntax=docker/dockerfile:1

# ---- 依赖 ----
FROM node:22-bookworm AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---- 构建 / 测试（compose verify 服务以此阶段为镜像）----
FROM node:22-bookworm AS builder
WORKDIR /app
ENV CI=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 运行时：纯静态站点（alpine 自带 busybox wget，供健康检查使用）----
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
