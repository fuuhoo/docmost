# syntax=docker/dockerfile:1
# ========== 构建阶段（含完整依赖） ==========
FROM node:22-alpine AS builder
WORKDIR /app

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

# 安装 pnpm，并设置 npm 使用淘宝镜像
RUN npm config set registry https://registry.npmmirror.com/ && \
    npm install -g pnpm@10.4.0

# 复制依赖描述文件（利用缓存）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/
COPY packages/editor-ext/package.json ./packages/editor-ext/

# 使用 BuildKit cache mount 持久化 pnpm store
# 只要 pnpm-lock.yaml 没变，依赖就从本地缓存恢复，无需重新下载
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# 复制源码并构建
COPY . .
RUN pnpm build

# ========== 生产部署阶段（只打包 server 运行时依赖） ==========
FROM node:22-alpine AS deployer
WORKDIR /app

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN npm config set registry https://registry.npmmirror.com/ && \
    npm install -g pnpm@10.4.0

# 只复制 pnpm 安装/部署所需的描述文件
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=builder /app/patches ./patches
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/client/package.json ./apps/client/
COPY --from=builder /app/packages/editor-ext/package.json ./packages/editor-ext/

# 复制构建产物（pnpm deploy 需要 workspace 包的产物在磁盘上）
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/packages/editor-ext/dist ./packages/editor-ext/dist

# 复用同一个 pnpm store cache，生成仅含生产依赖的 server 部署目录
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm deploy --filter=server --prod --legacy /deploy/server

# ========== 最终运行镜像（最小化） ==========
FROM node:22-alpine AS final
LABEL org.opencontainers.image.source="https://github.com/fuuhoo/docmost"

WORKDIR /app

# 复制 server 独立部署产物（含 dist 和精简后的 node_modules）
COPY --from=deployer --chown=node:node /deploy/server /app/apps/server

# 只保留 client 的静态构建产物（不需要其 node_modules）
COPY --from=builder --chown=node:node /app/apps/client/dist /app/apps/client/dist

# 确保运行时数据目录可写
RUN mkdir -p /app/data/storage && chown -R node:node /app/data

USER node
ENV NODE_ENV=production

VOLUME ["/app/data/storage"]
EXPOSE 3000

# 将工作目录切换到 server 产物目录，使 process.cwd() 为 /app/apps/server
# 从而 LOCAL_STORAGE_PATH 解析为 /app/data/storage，与 volume 挂载点一致
WORKDIR /app/apps/server
CMD ["node", "dist/main"]
