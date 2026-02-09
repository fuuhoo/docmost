# Docmost 开发与部署指南

## 项目介绍

Docmost 是一个开源的协作式知识库和文档软件，提供实时协作、图表支持、空间管理、权限管理等功能。

## 环境要求

- Node.js >= 18
- pnpm >= 10
- PostgreSQL >= 14
- Redis >= 7

## 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd docmost-self
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **配置环境变量**
   - 复制 `.env.example` 文件为 `.env`
   - 根据实际情况修改 `.env` 文件中的配置

## 启动方式

### 开发环境

#### 方法1：同时启动前端和后端（推荐）
```bash
# 在项目根目录执行
pnpm run dev
```
- 前端服务器：http://127.0.0.1:5173
- 后端服务器：http://127.0.0.1:3003

#### 方法2：单独启动前端
```bash
# 在 apps/client 目录执行
pnpm run dev
```
- 前端服务器：http://127.0.0.1:5173

#### 方法3：单独启动后端
```bash
# 在 apps/server 目录执行
pnpm run start:dev
```
- 后端服务器：http://127.0.0.1:3003

### 生产环境

#### 1. 构建项目
```bash
# 在项目根目录执行
pnpm run build
```

#### 2. 启动生产服务器
```bash
# 在项目根目录执行
pnpm run start
```
- 生产服务器：http://127.0.0.1:3003

#### 3. 启动协作服务（可选）
```bash
# 在项目根目录执行
pnpm run collab
```

## 配置说明

### 核心配置项

- `APP_URL`：应用的完整 URL，例如 `http://127.0.0.1:3003`
- `APP_SECRET`：应用密钥，至少 32 个字符
- `DATABASE_URL`：PostgreSQL 数据库连接 URL
- `REDIS_URL`：Redis 连接 URL
- `PORT`：服务器端口，默认 3003

### 存储配置

- `STORAGE_DRIVER`：存储驱动，可选值：`local` 或 `s3`
- `AWS_S3_ACCESS_KEY_ID`：AWS S3 访问密钥（当使用 S3 存储时）
- `AWS_S3_SECRET_ACCESS_KEY`：AWS S3 秘密密钥（当使用 S3 存储时）
- `AWS_S3_REGION`：AWS S3 区域（当使用 S3 存储时）
- `AWS_S3_BUCKET`：AWS S3 存储桶（当使用 S3 存储时）

### 邮件配置

- `MAIL_DRIVER`：邮件驱动，可选值：`smtp` 或 `postmark`
- `MAIL_FROM_ADDRESS`：发件人邮箱
- `MAIL_FROM_NAME`：发件人名称
- `SMTP_HOST`：SMTP 服务器地址
- `SMTP_PORT`：SMTP 服务器端口
- `SMTP_USERNAME`：SMTP 用户名
- `SMTP_PASSWORD`：SMTP 密码

## 数据库迁移

### 运行迁移
```bash
# 在 apps/server 目录执行
pnpm run migration:latest
```

### 创建新迁移
```bash
# 在 apps/server 目录执行
pnpm run migration:create <migration-name>
```

## 常见问题

### 1. 数据库连接失败
- 检查 PostgreSQL 服务是否运行
- 验证 `.env` 文件中的 `DATABASE_URL` 配置是否正确
- 确保数据库用户有足够的权限

### 2. Redis 连接失败
- 检查 Redis 服务是否运行
- 验证 `.env` 文件中的 `REDIS_URL` 配置是否正确

### 3. 端口占用
- 确保 3003（后端）和 5173（前端）端口没有被其他服务占用
- 可以在 `.env` 文件中修改 `PORT` 配置来更改后端端口

### 4. 依赖问题
- 尝试重新安装依赖：
  ```bash
  pnpm install
  ```

## 验证步骤

1. **启动服务器**：执行相应的启动命令
2. **检查日志**：查看服务器启动日志，确保没有错误信息
3. **访问前端**：打开浏览器访问 http://127.0.0.1:5173，确保前端页面正常加载
4. **访问后端 API**：访问 http://127.0.0.1:3003/api/health，确保后端 API 正常响应
5. **验证功能**：尝试登录、创建页面等基本功能，确保系统正常运行

## 开发工具

- **代码格式化**：
  ```bash
  pnpm run format
  ```

- **代码检查**：
  ```bash
  # 前端
  cd apps/client
  pnpm run lint
  
  # 后端
  cd apps/server
  pnpm run lint
  ```

## 许可证

Docmost 核心使用 AGPL 3.0 开源许可证。企业功能使用 Docmost Enterprise 许可证。

## 文档

更多详细文档，请访问 [Docmost 官方文档](https://docmost.com/docs)
