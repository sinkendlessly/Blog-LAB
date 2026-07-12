# BlogShare 前端剩余开发设计文档

**日期**: 2026-07-03
**状态**: 已批准

## 概述

BlogShare 是一个前后端分离的知识社区博客系统。后端（FastAPI + MySQL + Redis）已 100% 完成，前端基础约 70% 完成。本文档覆盖前端剩余所有开发工作，按四阶段推进，统一 Notion 知识库风格。

## 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 整体风格 | 统一 Notion 知识库风格 | 和现有布局组件一致，风格连贯 |
| 编辑器布局 | 沉浸全宽式 | 干净克制，专注写作 |
| 搜索交互 | Cmd/Ctrl+K 弹窗式 | 快速跳转，不需要独立搜索页 |
| 状态管理 | TanStack Query（服务端）+ Zustand（客户端） | 和现有代码一致 |

## 统一设计规范

- **配色**: 主色 Indigo (#4F46E5)，背景白/浅灰，文字深灰
- **字体**: PingFang SC，标题 28px/600，正文 15px/400
- **间距**: 页面内容区 max-w-4xl 居中，卡片间距 gap-6
- **动画**: 页面淡入 (fade-in)、卡片悬停上浮+阴影、点赞心跳缩放
- **组件复用**: 所有页面共享 AppLayout + UI 组件库，编辑器页切换为沉浸布局

---

## 阶段一：前端基础收尾

### 1.1 flexsearch 索引封装 — `client/src/lib/search.ts`

创建 `SearchIndex` 单例类，封装 flexsearch Document 索引：

- **索引字段**: title（权重 10）、content（权重 5）、tags（权重 8）
- **方法**:
  - `buildIndex(articles: ArticleIndexItem[])` — 批量建索引
  - `search(query: string): SearchResult[]` — 搜索返回文章 ID + 匹配字段
  - `highlight(text: string, query: string): string` — 高亮匹配词（mark 标签）
- **数据获取**: TanStack Query 拉取 `/articles/index`，staleTime 30 分钟
- **中文支持**: flexsearch CJK 分词（`encode: "icase"` + 自定义 tokenizer 按字符分词）

### 1.2 TableOfContents 组件 — `client/src/components/layout/TableOfContents.tsx`

- 从 Markdown 内容正则提取 `h1-h3` 标题，生成目录树结构
- IntersectionObserver 跟踪滚动，高亮当前可见章节
- 点击条目平滑滚动到对应锚点
- 固定定位在右侧栏，与 ArticlePage 配合使用

### 1.3 首页内容完善 — `client/src/pages/HomePage.tsx`

替换现有 hero + 功能卡片为实际内容：

- 顶部分类 Tab 切换（全部 + 各分类）
- 文章卡片网格列表（封面+标题+摘要+作者头像+标签+浏览/点赞数）
- 右侧热门排行 Top10（调用 searchApi.hot）
- 游标分页 + "加载更多"按钮
- 保留侧边栏分类导航

---

## 阶段二：编辑器 + 文章页

### 2.1 MarkdownEditor 组件 — `client/src/components/editor/MarkdownEditor.tsx`

- 基于 @uiw/react-md-editor，自定义工具栏（去除默认冗余按钮）
- 三种模式切换：编辑 / 预览 / 分屏（live）
- debounce 2s 触发 `onSave` 回调（由页面层处理 PATCH 请求）
- 保存状态 prop：`saving: boolean`，显示保存指示器

### 2.2 EditorToolbar 组件 — `client/src/components/editor/EditorToolbar.tsx`

- 标题输入框（大号字体，无边框，placeholder "输入标题..."）
- 保存状态指示：已保存 ✓ / 保存中... / 未保存 ●
- 预览切换按钮
- 发布设置按钮（打开右侧面板）

### 2.3 文章编辑器页 — `client/src/features/articles/EditorPage.tsx`

路由: `/editor`（新建）、`/editor/:id`（编辑）

**沉浸全宽布局**:
- 隐藏侧边栏（通过 uiStore 设置 sidebarCollapsed）
- 顶栏精简：标题输入 + 保存状态 + 发布按钮
- 主内容区：MarkdownEditor 占满宽度
- 右侧浮动面板（可收起）：分类选择 / 标签输入 / 封面上传 / 摘要 / 可见性 / 发布/草稿切换

**逻辑**:
- 新建时先 POST 创建草稿获取 article ID，后续自动保存用 PATCH
- 编辑时通过 ID 加载已有文章
- 发布前校验标题+分类必填
- 发布后跳转到文章阅读页

### 2.4 文章列表页 — `client/src/features/articles/ArticlesPage.tsx`

路由: `/articles`

- 顶部分类 Tab 切换（全部 + 各分类）
- 文章卡片列表（封面图 + 标题 + 摘要 + 作者信息 + 标签 + 浏览/点赞数）
- 游标分页 + 无限滚动加载（IntersectionObserver 触发加载更多）
- 空状态：无文章时显示引导创建

### 2.5 文章阅读页 — `client/src/features/articles/ArticlePage.tsx`

路由: `/article/:slug`

- 三栏布局：侧边栏 + 正文 + 右侧目录大纲（TableOfContents）
- 顶部：面包屑导航 + 返回按钮
- 标题区：文章标题 + 作者信息条（头像+名字+发布日期）+ 浏览量
- 正文区：Markdown 渲染（react-markdown + remark-gfm + rehype-highlight 代码高亮）
- 底部：标签列表 + 互动按钮栏（点赞/收藏/分享）+ 上/下篇导航
- 评论区：嵌套评论组件（CommentSection）

---

## 阶段三：社交 + 搜索页

### 3.1 搜索弹窗 — `client/src/components/SearchDialog.tsx`

- Cmd/Ctrl+K 全局唤起（在 TopBar 注册快捷键监听）
- 弹窗样式：顶部搜索框 + 下方结果列表
- flexsearch 实时搜索，结果高亮匹配词
- 结果项显示：标题 + 摘要片段 + 标签
- 点击结果跳转到文章页，Escape 关闭弹窗
- 无结果时显示热门推荐

### 3.2 个人主页 — `client/src/features/user/UserProfilePage.tsx`

路由: `/user/:id`

- 顶部个人信息区：大头像 + 用户名 + 简介 + 统计数据（文章数/关注/粉丝）
- 关注/取关按钮（非自己时显示）
- Tab 导航：发布的文章 / 收藏 / 关注的人
- 内容区：文章卡片网格 / 用户卡片列表

### 3.3 我的空间子页面

- **MyArticlesPage** (`/my/articles`) — 草稿 + 已发布文章管理，支持编辑/删除，状态标签显示
- **MyFavoritesPage** (`/my/favorites`) — 收藏文章列表，支持取消收藏
- **MyFollowingPage** (`/my/following`) — 关注用户卡片列表，支持取关

### 3.4 设置页 — `client/src/features/user/SettingsPage.tsx`

路由: `/settings`

- 个人信息表单：头像上传 / 用户名 / 简介
- 修改密码表单：旧密码 + 新密码 + 确认密码
- 保存成功 Toast 提示

### 3.5 归档页 — `client/src/features/articles/ArchivePage.tsx`

路由: `/archive`

- 按月分组展示文章列表（年月标题 + 文章列表）
- 调用 articlesApi.archive() 获取数据
- 文章项显示：标题 + 发布日期 + 浏览量

### 3.6 互动 UI 组件 — `client/src/components/interaction/`

- **LikeButton** — 点赞按钮（心跳缩放动画 + 计数显示，调用 interactionApi.toggleLike）
- **FavoriteButton** — 收藏按钮（星标填充动画 + 计数，调用 interactionApi.toggleFavorite）
- **CommentSection** — 嵌套评论组件（评论列表 + 回复框 + 删除按钮，递归渲染子评论）
- **ShareButton** — 分享下拉菜单（微博/微信/Twitter/链接复制，调用 interactionApi.recordShare）

---

## 阶段四：后台管理 + 部署

### 4.1 管理布局 — `client/src/features/admin/AdminLayout.tsx`

- 左侧固定菜单栏：数据概览 / 文章审核 / 用户管理
- 独立于主站 AppLayout，使用 AdminRoute 守卫
- 顶部：管理员信息 + 返回主站链接

### 4.2 管理页面

- **DashboardPage** (`/admin`) — 统计卡片（文章数/用户数/评论数/互动数）+ Recharts 折线趋势图（近 30 天文章/用户增长）
- **ReviewPage** (`/admin/review`) — 待审核文章列表 + 通过/拒绝操作 + 预览弹窗
- **UsersPage** (`/admin/users`) — 用户表格（头像/用户名/邮箱/角色/状态/注册日期）+ 封禁/解封/设管理员操作

### 4.3 部署验证

- 验证 docker-compose.yml 四服务编排配置（MySQL + Redis + FastAPI + Nginx）
- 验证 nginx.conf 反向代理 + SPA 路由 + gzip 配置
- 确认 .env.example 环境变量完整

---

## 文件结构新增清单

```
client/src/
├── lib/
│   └── search.ts                          # flexsearch 索引封装
├── components/
│   ├── layout/
│   │   └── TableOfContents.tsx            # 文章目录大纲
│   ├── editor/
│   │   ├── MarkdownEditor.tsx             # Markdown 编辑器
│   │   └── EditorToolbar.tsx              # 编辑器工具栏
│   ├── interaction/
│   │   ├── LikeButton.tsx                 # 点赞按钮
│   │   ├── FavoriteButton.tsx             # 收藏按钮
│   │   ├── CommentSection.tsx             # 评论组件
│   │   └── ShareButton.tsx                # 分享按钮
│   └── SearchDialog.tsx                   # 搜索弹窗
├── features/
│   ├── articles/
│   │   ├── EditorPage.tsx                 # 文章编辑器页
│   │   ├── ArticlesPage.tsx               # 文章列表页
│   │   ├── ArticlePage.tsx                # 文章阅读页
│   │   └── ArchivePage.tsx                # 归档页
│   ├── user/
│   │   ├── UserProfilePage.tsx            # 个人主页
│   │   ├── MyArticlesPage.tsx             # 我的文章
│   │   ├── MyFavoritesPage.tsx            # 我的收藏
│   │   ├── MyFollowingPage.tsx            # 我的关注
│   │   └── SettingsPage.tsx               # 设置页
│   └── admin/
│       ├── AdminLayout.tsx                # 管理布局
│       ├── DashboardPage.tsx              # 数据概览
│       ├── ReviewPage.tsx                 # 文章审核
│       └── UsersPage.tsx                  # 用户管理
└── pages/
    └── HomePage.tsx                        # 完善首页内容
```

## 依赖新增

- `flexsearch` — 客户端全文搜索
- `@uiw/react-md-editor` — Markdown 编辑器
- `react-markdown` + `remark-gfm` + `rehype-highlight` — Markdown 渲染
- `recharts` — 后台数据可视化图表

## 实现顺序

1. 阶段一 → 阶段二 → 阶段三 → 阶段四（严格顺序，后者依赖前者）
2. 每个阶段内，先基础设施（lib/组件），再页面
3. 每完成一个阶段，验证功能可运行
