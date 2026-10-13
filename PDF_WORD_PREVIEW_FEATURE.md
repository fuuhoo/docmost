# PDF/Word 预览功能

## 功能概述

在编辑器和阅读页面增加了 PDF 和 Word 文档的内联预览功能。用户上传 PDF 或 Word 文档后，可以直接在编辑器中预览内容，无需下载或跳转到外部应用。

## 实现内容

### 1. PDF 预览组件 (`pdf-view.tsx`)

- **紧凑视图**：显示文件名、文件大小和 PDF 图标
- **展开预览**：使用 iframe 嵌入浏览器原生 PDF 渲染器
- **功能特性**：
  - 支持全屏查看（600px 高度）
  - 可折叠/展开预览
  - 下载按钮
  - 加载状态提示

### 2. Word 预览组件 (`word-view.tsx`)

- **紧凑视图**：显示文件名、文件大小和 Word 图标
- **展开预览**：使用 mammoth.js 将 DOCX 转换为 HTML 进行渲染
- **功能特性**：
  - 客户端实时转换（无需服务器处理）
  - 保留基本格式（标题、段落、列表、表格等）
  - 滚动查看长文档
  - 错误处理和加载状态

### 3. Attachment 节点扩展

修改了 `attachment-view.tsx`，根据文件的 MIME 类型自动选择对应的预览组件：
- `application/pdf` → PDF 预览组件
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` → Word 预览组件 (.docx)
- `application/msword` → Word 预览组件 (.doc)
- 其他文件类型 → 原始简单附件视图

## 使用方法

### 上传文档

1. 在编辑器中输入 `/` 打开命令菜单
2. 选择 "File attachment" 或直接拖拽文件到编辑器
3. 选择 PDF 或 Word 文档上传

### 预览文档

**编辑模式：**
- 上传后会显示紧凑视图
- 点击最大化图标展开预览
- 再次点击可折叠回紧凑视图

**只读模式：**
- 默认显示紧凑视图
- 点击文件名可直接下载
- 悬停时显示操作按钮

## 技术细节

### 依赖包

- `mammoth@^1.11.0`：用于客户端 Word 文档转换
- 浏览器原生 PDF 渲染（通过 iframe）

### 文件结构

```
apps/client/src/features/editor/components/
├── attachment/
│   ├── attachment-view.tsx      # 主附件视图（路由逻辑）
│   └── upload-attachment-action.tsx
├── pdf/
│   └── pdf-view.tsx             # PDF 预览组件
└── word/
    ├── word-view.tsx            # Word 预览组件
    └── word-view.module.css     # Word 预览样式
```

### 性能考虑

- **PDF**：使用浏览器原生渲染，性能最佳
- **Word**：客户端转换，首次加载时异步处理，不影响编辑器响应
- 预览仅在用户主动展开时加载完整内容

## 浏览器兼容性

- **PDF 预览**：需要现代浏览器支持 iframe PDF 渲染（Chrome、Firefox、Edge、Safari 均支持）
- **Word 预览**：需要支持 ES Module 动态导入和 ArrayBuffer API

## 后续优化建议

1. **PDF 分页加载**：对于大型 PDF 文件，可以实现分页加载
2. **Word 缓存**：缓存已转换的 Word 文档，避免重复转换
3. **缩略图生成**：为 PDF 生成第一页缩略图作为预览
4. **打印支持**：添加直接打印按钮
5. **更多格式支持**：扩展到 Excel、PowerPoint 等格式

## 注意事项

- 文件大小受系统配置限制（通过 `getFileUploadSizeLimit()` 控制）
- Word 文档转换可能丢失部分复杂格式（如特殊字体、高级排版）
- PDF 预览依赖浏览器的内置渲染能力，不同浏览器可能有细微差异
