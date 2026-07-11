# ========== 基础阶段（Alpine 更小） ==========
FROM node:22-alpine AS base
# LibreOffice is used to convert DOCX exports to PDF. It also pulls in fonts
# needed for CJK characters, so font-noto-cjk is no longer required separately.
RUN apk add --no-cache libreoffice && \
    npm install -g pnpm@10.4.0 && \
    pnpm config set registry https://registry.npmmirror.com/

# ========== 构建阶段 ==========
FROM base AS builder
WORKDIR /app

# 复制依赖描述文件（利用缓存）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/
COPY packages/editor-ext/package.json ./packages/editor-ext/

# 安装全部依赖（构建需要 devDependencies）
RUN pnpm install --frozen-lockfile

# 复制源码并构建
COPY . .
RUN pnpm build

# ========== 生产部署阶段 ==========
FROM base AS installer
WORKDIR /app

# 复制构建产物和必要的 package.json
COPY --from=builder /app/apps/server/dist /app/apps/server/dist
COPY --from=builder /app/apps/client/dist /app/apps/client/dist
COPY --from=builder /app/packages/editor-ext/dist /app/packages/editor-ext/dist

COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder /app/.npmrc /app/.npmrc
COPY --from=builder /app/patches /app/patches
COPY --from=builder /app/apps/server/package.json /app/apps/server/package.json
COPY --from=builder /app/apps/client/package.json /app/apps/client/package.json
COPY --from=builder /app/packages/editor-ext/package.json /app/packages/editor-ext/package.json

# 复制字体（如果字体太多，可以只保留必要的，例如只复制 NotoSansCJK-Regular.ttc）
# 此处保留原样
COPY docker/fonts/*.ttc /usr/share/fonts/opentype/noto/

# 使用 pnpm deploy 为每个子项目生成独立的部署目录（只包含生产依赖）
# 添加 --legacy 以兼容 pnpm v10 的默认行为
RUN pnpm deploy --filter=server --prod --legacy /deploy/server && \
    pnpm deploy --filter=client --prod --legacy /deploy/client && \
    pnpm deploy --filter=editor-ext --prod --legacy /deploy/editor-ext

# 合并部署文件（将部署目录的 node_modules 等内容整合到 /app 下）
RUN mkdir -p /app/apps/server /app/apps/client /app/packages/editor-ext && \
    cp -r /deploy/server/* /app/apps/server/ && \
    cp -r /deploy/client/* /app/apps/client/ && \
    cp -r /deploy/editor-ext/* /app/packages/editor-ext/ && \
    rm -rf /deploy

# 删除源码、测试文件等（可选，减少体积）
RUN find /app -name "*.md" -delete && \
    find /app -name "*.ts" -delete && \
    find /app -name "*.map" -delete && \
    rm -rf /app/apps/server/src /app/apps/client/src /app/packages/editor-ext/src

# 切换用户（Alpine 默认有 node 用户）
RUN chown -R node:node /app
USER node

# ========== 最终运行镜像 ==========
FROM node:22-alpine AS final
LABEL org.opencontainers.image.source="https://github.com/fuuhoo/docmost"

# LibreOffice is also required in the final runtime image.
RUN apk add --no-cache libreoffice

# 只复制运行时需要的目录（已精简）
COPY --from=installer --chown=node:node /app /app
COPY --from=installer --chown=node:node /usr/share/fonts/opentype/noto /usr/share/fonts/opentype/noto

WORKDIR /app
ENV NODE_ENV=production

RUN mkdir -p /app/data/storage && chown -R node:node /app/data
VOLUME ["/app/data/storage"]

EXPOSE 3000
USER node
CMD ["node", "apps/server/dist/main"]