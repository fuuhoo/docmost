<div align="center">
    <h1><b>Docmost</b></h1>
    <p>
        Open-source collaborative wiki and documentation software.
        <br />
        <a href="https://docmost.com"><strong>Website</strong></a> | 
        <a href="https://docmost.com/docs"><strong>Documentation</strong></a> |
        <a href="https://twitter.com/DocmostHQ"><strong>Twitter / X</strong></a>
    </p>
</div>
<br />

## Getting started

To get started with Docmost, please refer to our [documentation](https://docmost.com/docs) or try our [cloud version](https://docmost.com/pricing) .

## Docker 启动

本仓库自带 `docker-compose.yml`（含应用、PostgreSQL、Redis）。

### 1. 准备环境变量

在 compose 的 `environment` 中配置（或改成 `env_file: .env`）：

| 变量 | 说明 |
| --- | --- |
| `APP_URL` | 对外访问地址，例如 `http://172.17.4.75:3000` |
| `APP_SECRET` | 随机长密钥（`openssl rand -hex 32`） |
| `DATABASE_URL` | `postgresql://user:pass@db:5432/docmost` |
| `REDIS_URL` | `redis://redis:6379` |
| `MAIL_*` / `SMTP_*` | 发信配置（邀请、注册、找回密码） |

**可不再配置的环境变量（已改为界面设置）：**

- `ENABLE_REGISTRATION` — 在 **设置 → Security & SSO → 允许自主注册** 开关控制
- `EMAIL_ALLOWED_DOMAINS` — 在同一页面 **允许的邮箱域名** 里维护（支持多个）

> 说明：若仍配置这两个环境变量，会作为兜底；但环境变量开启注册后，界面关闭可能无效。推荐删掉环境变量，只在界面里配置。

### docker-compose 示例

可直接复制为 `docker-compose.yml`（请替换密码、密钥、`APP_URL` 与镜像 tag）：

```yaml
services:
  docmost:
    image: fubin/docmost:v260916-sw
    # 或 registry.cn-qingdao.aliyuncs.com/fubin/docmost:v260916-sw
    depends_on:
      - db
      - redis
    environment:
      # 对外访问地址：协议 + 主机 + 端口，需与浏览器访问一致
      APP_URL: "http://172.17.4.75:3000"
      # openssl rand -hex 32
      APP_SECRET: "REPLACE_WITH_LONG_SECRET"
      DATABASE_URL: "postgresql://docmost:STRONG_DB_PASSWORD@db:5432/docmost"
      REDIS_URL: "redis://redis:6379"

      # 邮件（邀请 / 注册 / 找回密码），可按需修改
      MAIL_DRIVER: smtp
      MAIL_FROM_ADDRESS: noreply@example.com
      MAIL_FROM_NAME: Docmost
      SMTP_HOST: smtp.example.com
      SMTP_PORT: 587
      SMTP_USERNAME: noreply@example.com
      SMTP_PASSWORD: REPLACE_WITH_SMTP_PASSWORD
      SMTP_SECURE: "false"
      SMTP_IGNORETLS: "false"

      # 自主注册与邮箱域名白名单请在「设置 → Security & SSO」里配置
      # 不必再写 ENABLE_REGISTRATION / EMAIL_ALLOWED_DOMAINS

    ports:
      - "3000:3000"
    restart: unless-stopped
    volumes:
      # 附件等本地存储
      - ./docmost:/app/data/storage

  db:
    image: postgres:16-alpine
    # 若使用自建镜像，可改为 fubin/postgres:18，并确认数据目录路径
    environment:
      POSTGRES_DB: docmost
      POSTGRES_USER: docmost
      POSTGRES_PASSWORD: STRONG_DB_PASSWORD
    restart: unless-stopped
    volumes:
      - ./db_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    # 若使用自建镜像，可改为 fubin/redis:8.2.3
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]
    restart: unless-stopped
    volumes:
      - ./redis_data:/data
```

启动：

```bash
docker compose up -d
docker compose logs -f docmost
```

### 2. 启动

```bash
docker compose up -d
```

浏览器打开 `APP_URL`（默认映射宿主机 `3000`）。邀请链接需与用户访问的域名一致；生产环境请把 `APP_URL` 设为对外地址（含协议和端口）。

### 3. 首次使用

1. 完成初始管理员与工作区创建  
2. 用 **Owner** 账号进入 **设置 → Security & SSO**  
3. 打开「允许自主注册」，按需填写允许的邮箱域名（如 `swinfo.com.cn`，可多个）

### 4. 权限说明（本仓库定制）

- 仅 **工作区所有者** 可修改工作区名称、图标，以及邀请/移除成员、改角色  
- **普通成员** 可创建自己的空间，并成为该空间管理员  
- 注册开关与邮箱域名白名单在 Security 设置中维护

### 5. 数据库

生产镜像启动时会自动执行迁移，并校验关键表结构；失败会退出并打日志。

本地开发手动迁移：

```bash
pnpm --filter server run migration:up
```

### 6. 本地开发邀请链接

开发时请使用前端地址打开应用：**http://localhost:5173**（不要用 API 的 3000）。

- 「复制邀请链接」会使用当前浏览器地址生成，便于本地调试  
- 邮件里的链接仍使用 `APP_URL`；本地若要测邮件链，可把 `.env` 的 `APP_URL` 改为 `http://localhost:5173`  
- 生产 Docker 镜像内含前端静态资源，访问 `http://<host>:3000/invites/...` 由服务端 SPA 回退到 `index.html`，不会 404

## Features

- Real-time collaboration
- Diagrams (Draw.io, Excalidraw and Mermaid)
- Spaces
- Permissions management
- Groups
- Comments
- Page history
- Search
- File attachments
- Embeds (Airtable, Loom, Miro and more)
- Translations (10+ languages)

### 本仓库定制功能说明

#### 1. 工作区权限收紧

| 角色 | 设置菜单可见 | 可改工作区名称/图标 | 可管理成员（邀请、移除、改角色） | 可创建空间 | 可管理分组等 |
| --- | --- | --- | --- | --- | --- |
| **Owner（所有者）** | 全部 | 是 | 是 | 是 | 是 |
| **Admin（管理员）** | 无「通用」「成员」「安全」 | 否 | 否 | 是 | 是 |
| **Member（普通成员）** | 无「通用」「成员」「安全」 | 否 | 否 | 是 | 否 |

- 普通成员与管理员**不能**修改工作区名称、图标，也不能邀请/删除成员或调整角色；仅 **Owner** 可以。
- 普通成员**可以**创建自己的空间，创建后自动成为该空间管理员。

#### 2. 自主注册（界面配置）

入口：**设置 → Security & SSO**（仅 Owner 可见）

- **允许自主注册**：开关。开启后，用户可在登录页进入注册页自行申请账号（发邀请邮件）。
- **允许的邮箱域名**：支持多个域名（用逗号或空格分隔）。留空表示不限制；填写后仅这些域名的邮箱可注册/加入。

说明：

- 不再依赖环境变量 `ENABLE_REGISTRATION`、`EMAIL_ALLOWED_DOMAINS`；若仍配置，仅作兜底。
- 注册页会展示当前是否允许注册，以及允许的域名列表。

#### 3. 数据库

启动时自动执行迁移，并校验关键字段（如 `workspaces.enable_registration`）是否存在；校验失败进程会退出并提示。

### Screenshots

<p align="center">
<img alt="home" src="https://docmost.com/screenshots/home.png" width="70%">
<img alt="editor" src="https://docmost.com/screenshots/editor.png" width="70%">
</p>

### License
Docmost core is licensed under the open-source AGPL 3.0 license.  
Enterprise features are available under an enterprise license (Enterprise Edition).  

All files in the following directories are licensed under the Docmost Enterprise license defined in `packages/ee/License`.
  - apps/server/src/ee
  - apps/client/src/ee
  - packages/ee

### Contributing

See the [development documentation](https://docmost.com/docs/self-hosting/development)

## Thanks
Special thanks to;

<img width="100" alt="Crowdin" src="https://github.com/user-attachments/assets/a6c3d352-e41b-448d-b6cd-3fbca3109f07" />

[Crowdin](https://crowdin.com/) for providing access to their localization platform.


<img width="48" alt="Algolia-mark-square-white" src="https://github.com/user-attachments/assets/6ccad04a-9589-4965-b6a1-d5cb1f4f9e94" />

[Algolia](https://www.algolia.com/) for providing full-text search to the docs.

