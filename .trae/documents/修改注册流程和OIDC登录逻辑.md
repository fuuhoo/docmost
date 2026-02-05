# 修改注册流程和OIDC登录逻辑

## 1. 客户端修改

### 1.1 修改认证逻辑

* **文件**：`apps/client/src/features/auth/hooks/use-auth.ts`

* **修改**：更新 `handleSetupWorkspace` 方法

  * 先判断现在是否存在工作区，如果存在工作区则不执行创建工作区

  * 直接调用注册API，将用户注册到现有工作区

  * 对于云环境，保持现有逻辑不变

### 1.2 修改注册表单

* **文件**：`apps/client/src/features/auth/components/setup-workspace-form.tsx`

* **修改**：

  * 移除工作区名称输入字段（非云环境）

  * 简化表单，只保留名称、邮箱和密码字段

## 2. 服务器端修改

### 2.1 修改OIDC登录逻辑

* **文件**：`apps/server/src/core/auth/services/sso.service.ts`

* **修改**：

  * 更新 `findOrCreateUser` 方法，添加邮箱格式验证

  * 更新 `handleCallback` 方法，添加错误处理和提醒

  * 当没有有效的邮箱字段时，抛出明确的错误信息

### 2.2 修改认证服务

* **文件**：`apps/server/src/core/auth/services/auth.service.ts`

* **修改**：

  * 确保 `register` 方法能够找到第一个创建的工作区

  * 当没有提供工作区ID时，默认使用系统中的第一个工作区

### 2.3 修改注册服务

* **文件**：`apps/server/src/core/auth/services/signup.service.ts`

* **修改**：

  * 确保 `signup` 方法能够正确处理用户注册到现有工作区的逻辑

  * 添加工作区查找逻辑，当没有提供工作区ID时使用第一个工作区

## 3. 数据库和服务修改

### 3.1 修改工作区服务

* **文件**：`apps/server/src/core/workspace/services/workspace.service.ts`

* **修改**：

  * 添加获取第一个工作区的方法

  * 确保新用户能够正确添加到工作区

### 3.2 修改认证控制器

* **文件**：`apps/server/src/core/auth/auth.controller.ts`

* **修改**：

  * 更新 `setup` 方法，确保第一个用户能够正确创建工作区

  * 确保后续注册的用户能够正确添加到该工作区

## 4. 验证和测试

### 4.1 功能测试

* 测试第一个用户创建工作区的流程

* 测试后续用户注册到现有工作区的流程

* 测试OIDC登录时的邮箱验证逻辑

* 测试OIDC登录时没有有效邮箱的错误处理

### 4.2 边界情况测试

* 测试系统中没有工作区时的注册流程

* 测试系统中有多个工作区时的注册流程

* 测试OIDC登录时邮箱字段为null或空字符串的情况

* 测试OIDC登录时邮箱格式不正确的情况

## 5. 关键修改点

1. **邮箱验证**：在OIDC登录时添加严格的邮箱格式验证
2. **工作区查找**：实现自动查找第一个工作区的逻辑
3. **错误处理**：为OIDC登录时的邮箱问题添加明确的错误信息
4. **注册流程**：简化注册流程，移除不必要的工作区创建步骤
5. **兼容性**：确保修改后的

