# ========== 字体下载阶段（独立，避免多阶段重复下载） ==========
FROM node:22-alpine AS font-downloader
RUN apk add --no-cache curl && \
    mkdir -p /fonts && \
    curl -fsSL -o /fonts/NotoSansCJKsc-Regular.otf \
        https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf && \
    curl -fsSL -o /fonts/NotoSansCJKsc-Bold.otf \
        https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf

# ========== 构建阶段（含完整依赖） ==========
FROM node:22-alpine AS builder
WORKDIR /app

# 安装构建工具（curl 用于字体下载）
RUN apk add --no-cache curl && \
    npm install -g pnpm@10.4.0

# 复制依赖描述文件（利用缓存）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/
COPY packages/editor-ext/package.json ./packages/editor-ext/

# 安装全部依赖（构建需要 devDependencies）
RUN pnpm install --frozen-lockfile

# 复制字体到构建阶段（pdfkit 构建时可用）
COPY --from=font-downloader /fonts /usr/share/fonts/opentype/noto

# 复制源码并构建
COPY . .
RUN pnpm build

# ========== 生产部署阶段（只打包 server 运行时依赖） ==========
FROM node:22-alpine AS deployer
WORKDIR /app

RUN npm install -g pnpm@10.4.0

# 只复制 pnpm 安装/部署所需的描述文件
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=builder /app/patches ./patches
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/client/package.json ./apps/client/
COPY --from=builder /app/packages/editor-ext/package.json ./packages/editor-ext/

# 复制构建产物（pnpm deploy 需要 workspace 包的产物在磁盘上）
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/packages/editor-ext/dist ./packages/editor-ext/dist

# 仅生成 server 的独立部署目录（含生产依赖）
RUN pnpm deploy --filter=server --prod --legacy /deploy/server

# ========== 最终运行镜像（最小化） ==========
FROM node:22-alpine AS final
LABEL org.opencontainers.image.source="https://github.com/fuuhoo/docmost"

WORKDIR /app

# 运行阶段只保留 ca-certificates（HTTPS 请求需要），无需 curl
RUN apk add --no-cache ca-certificates

# 复制字体
COPY --from=font-downloader --chown=node:node /fonts /usr/share/fonts/opentype/noto

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

CMD ["node", "apps/server/dist/main"]
