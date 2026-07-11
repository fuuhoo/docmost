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

# 复制字体到构建阶段（pdfkit 构建时可用，同时便于最终复制）
COPY --from=font-downloader /fonts /usr/share/fonts/opentype/noto

# 复制源码并构建
COPY . .
RUN pnpm build

# ========== 生产依赖阶段（只保留运行时依赖） ==========
FROM node:22-alpine AS deps
WORKDIR /app

RUN npm install -g pnpm@10.4.0

# 只复制安装生产依赖所需的文件
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=builder /app/patches ./patches
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/client/package.json ./apps/client/
COPY --from=builder /app/packages/editor-ext/package.json ./packages/editor-ext/

# 安装生产依赖（workspace 链接会自动指向 packages/editor-ext）
RUN pnpm install --prod --frozen-lockfile

# ========== 最终运行镜像（最小化） ==========
FROM node:22-alpine AS final
LABEL org.opencontainers.image.source="https://github.com/fuuhoo/docmost"

WORKDIR /app

# 运行阶段只保留必要系统工具
RUN apk add --no-cache curl ca-certificates

# 复制字体
COPY --from=font-downloader --chown=node:node /fonts /usr/share/fonts/opentype/noto

# 复制生产依赖（包含 workspace 链接和 node_modules）
COPY --from=deps --chown=node:node /app .

# 复制构建产物
COPY --from=builder --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=builder --chown=node:node /app/apps/client/dist ./apps/client/dist
COPY --from=builder --chown=node:node /app/packages/editor-ext/dist ./packages/editor-ext/dist

# 确保运行时数据目录可写
RUN mkdir -p /app/data/storage && chown -R node:node /app/data

USER node
ENV NODE_ENV=production

VOLUME ["/app/data/storage"]
EXPOSE 3000

CMD ["node", "apps/server/dist/main"]
