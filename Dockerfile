FROM node:22-bullseye AS base

RUN npm install -g pnpm@10.4.0

FROM base AS builder

WORKDIR /app

COPY . .

# 1. 确保安装了编译 sharp 所需的底层库
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    pkg-config \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# 2. 关键修改：告诉 sharp 忽略预编译二进制文件，强制从源码编译
# 这会根据你当前的 CPU 指令集生成兼容的模块
ENV npm_config_build_from_source=true

RUN pnpm install
RUN pnpm build

FROM base AS installer

# 3. 运行环境也需要 libvips 库支持
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl bash libvips \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy apps
COPY --from=builder /app/apps/server/dist /app/apps/server/dist
COPY --from=builder /app/apps/client/dist /app/apps/client/dist
COPY --from=builder /app/apps/server/package.json /app/apps/server/package.json

# Copy packages
COPY --from=builder /app/packages/editor-ext/dist /app/packages/editor-ext/dist
COPY --from=builder /app/packages/editor-ext/package.json /app/packages/editor-ext/package.json

# Copy root package files
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm*.yaml /app/
COPY --from=builder /app/.npmrc /app/.npmrc

# Copy patches
COPY --from=builder /app/patches /app/patches

# Copy node_modules from builder (现在包含了本地编译的 sharp)
COPY --from=builder /app/node_modules /app/node_modules

RUN chown -R node:node /app

USER node

RUN mkdir -p /app/data/storage

VOLUME ["/app/data/storage"]

EXPOSE 3000

CMD ["pnpm", "start"]
