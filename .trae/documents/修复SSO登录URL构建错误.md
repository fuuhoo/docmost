## 问题分析

**现象**：用户点击SSO登录按钮后，被重定向到了 `http://localhost:5173/api/sso/019c2192-1f1b-755c-8b99-2ff2b59a099e`，但没有任何响应。

**根本原因**：
- 前端使用 `getAppUrl()` 构建SSO登录URL，而 `getAppUrl()` 返回当前页面的URL（`${window.location.protocol}//${window.location.host}`）
- 在开发环境中，前端运行在 `http://localhost:5173`，所以构建的URL指向了前端开发服务器
- 前端开发服务器没有处理 `/api/sso/*` 路径的能力，导致无响应

## 解决方案

修改前端 `sso.utils.ts` 文件中的 `buildSsoLoginUrl` 函数，为OIDC提供商使用 `getServerAppUrl()` 而不是 `getAppUrl()`，确保URL指向后端服务器。

**修改文件**：
- `src/ee/security/sso.utils.ts`

**具体修改**：
1. 将OIDC提供商的URL构建逻辑从使用 `getAppUrl()` 改为使用 `getServerAppUrl()`
2. 确保构建的URL格式正确，指向后端服务器的 `/api/sso/{providerId}` 端点

**预期效果**：
- 用户点击SSO登录按钮后，会被正确重定向到后端服务器的SSO登录端点
- 后端服务器会处理请求并重定向到OIDC提供商的授权页面
- 整个SSO登录流程能够正常完成