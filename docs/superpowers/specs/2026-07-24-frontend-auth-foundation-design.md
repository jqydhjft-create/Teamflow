# TeamFlow 前端基础与认证闭环设计

日期：2026-07-24

## 目标

在现有 FastAPI 后端保持不变的前提下，新建 `frontend/` Vue 3 单页应用，完成前端脚手架、路由、Pinia、Axios API 层，以及注册、登录、当前用户恢复、受保护路由和客户端退出的完整闭环。

本阶段完成后，用户能够注册或登录，刷新页面后恢复当前用户，进入受保护的 Dashboard 应用壳层，并可靠退出。真实项目列表、项目创建、邀请码加入和 Kanban 看板不属于本阶段。

## 现状与约束

- 当前仓库没有前端目录或 Node 项目清单，前端从 `frontend/` 开始建立。
- 后端认证接口已经实现，不新增或重复开发后端接口。
- 注册使用 `POST /api/auth/register`。
- 登录使用 `POST /api/auth/login`。
- 当前用户使用 `GET /api/auth/me`。
- 退出使用现有 `POST /api/auth/logout` 占位接口；服务端暂不撤销 JWT。
- 认证请求使用 `Authorization: Bearer <token>`。
- `/api/auth/me` 的成功响应缺少 `message` 字段，前端类型和解包逻辑必须兼容这一现状。
- 根目录 `.git` 不是有效 Git 仓库，当前不能依赖 Git 状态或提交记录追踪变更。

## 技术选型

- Vue 3，Composition API 与 `<script setup lang="ts">`
- Vite 与 TypeScript
- Vue Router
- Pinia Setup Store
- Element Plus
- Axios
- Vitest、Vue Test Utils 与 jsdom
- ESLint
- pnpm

本阶段不引入 SortableJS 或 ECharts；它们在项目列表和 Kanban 阶段按实际需求加入。

## 工程结构

前端采用轻量领域分层：

```text
frontend/
├── src/
│   ├── api/          # Axios 实例、响应/错误类型、认证 API
│   ├── components/   # 认证表单和应用壳层中的可复用组件
│   ├── router/       # 路由定义和认证守卫
│   ├── stores/       # Pinia 认证状态
│   ├── styles/       # 全局变量、基础样式和响应式布局
│   ├── types/        # 共享领域类型
│   ├── views/        # LoginView、DashboardView
│   ├── App.vue
│   └── main.ts
├── tests/            # 测试环境和跨模块测试辅助代码
├── .env.example
├── package.json
├── tsconfig*.json
├── vite.config.ts
└── vitest.config.ts
```

页面不直接调用 Axios。页面调用 Auth Store，Store 调用认证 API，认证 API 使用统一 Axios 实例。

## API 层

Axios 实例从 `VITE_API_BASE_URL` 读取后端地址，开发环境示例为 `http://127.0.0.1:8000`。

请求拦截器在存在 Token 时加入 Bearer Header。响应层保留完整 Axios 错误信息供登录和注册表单判断，同时提供统一的业务错误提取函数，将后端的 `http_error`、`validation_error`、网络错误和未知错误转换为稳定的前端错误对象。

成功响应类型允许 `message` 可选，以兼容 `/api/auth/me`。认证 API 提供以下函数：

- `register(payload)`
- `login(payload)`
- `getCurrentUser()`
- `logout()`

登录和注册接口返回 `{ user, token }`，当前用户接口返回用户对象。

## Token 与认证状态

第一阶段使用 `localStorage` 保存 JWT，键名采用前端内部常量统一管理。选择该方案是因为当前后端仅支持 Bearer Token，没有 HttpOnly Cookie 会话接口。

Auth Store 管理：

- `token`
- `user`
- `initialized`
- `isAuthenticated`
- `login()`
- `register()`
- `restoreSession()`
- `logout()`
- `clearSession()`

Store 初始化时读取本地 Token，但不会仅凭 Token 判定有效登录。应用首次进入受保护区域前调用 `/api/auth/me` 验证 Token 并恢复用户。验证失败时清除本地状态。

注册和登录成功后同时保存 Token 与当前用户，然后进入原目标路由；没有原目标时进入 `/dashboard`。

客户端退出会尝试调用现有退出接口，但无论接口成功、失败或网络不可达，都清除本地 Token 和用户状态并返回 `/login`。这不会被描述为服务端 Token 撤销。

## 路由与初始化

本阶段包含：

- `/login`：公开路由，承载登录和注册表单。
- `/dashboard`：受保护路由，承载后续项目列表的应用壳层。
- 未匹配路径：重定向到 `/dashboard`，再由认证守卫决定最终去向。

路由守卫遵循以下规则：

1. 首次导航时只执行一次 `restoreSession()`。
2. 受保护路由在未认证时跳转 `/login`，并通过查询参数保存原目标地址。
3. 已认证用户访问 `/login` 时跳转 `/dashboard` 或安全的原目标地址。
4. 重定向目标只接受站内路径，禁止协议 URL 和双斜杠外部跳转。
5. 初始化完成前显示稳定加载状态，避免登录页与 Dashboard 闪烁切换。

Axios 遇到受保护请求的 `401` 时清除认证状态，并在当前不属于登录提交流程时跳转登录页。登录接口返回的凭据错误留在表单中展示，避免产生重复导航。

## 页面与视觉设计

认证页采用已确认的“安静的分栏”方向。

桌面端左侧为 TeamFlow 品牌区，使用简化三列任务状态构图建立 Kanban 联想；右侧为认证表单。页面是实际应用入口，不使用营销式英雄区或装饰性大卡片。

移动端改为单列，品牌区压缩为顶部品牌标识和一句产品定位，确保表单在常见手机宽度下完整可用。

登录与注册使用分段切换：

- 登录：用户名或邮箱、密码。
- 注册：用户名、邮箱、密码、确认密码。

表单行为：

- 用户名限制 2-20 字符。
- 邮箱使用合法邮箱校验。
- 密码限制 6-50 字符。
- 确认密码必须与密码一致。
- 密码输入支持显示和隐藏。
- 提交期间按钮显示加载状态并禁止重复提交。
- 切换模式时清理不再相关的字段错误，不丢失仍然相关的输入。
- 不实现验证码或倒计时，因为后端没有对应接口。

Dashboard 是真实的受保护应用壳层，包含 TeamFlow 品牌、当前用户名和退出操作，以及后续项目列表的稳定内容区域。本阶段不伪造项目、任务或统计数据。

## 错误处理

- 登录 `401`：表单提示用户名、邮箱或密码错误，并保留用户输入。
- 注册 `409`：提示用户名或邮箱已存在。
- 参数 `422`：优先读取后端 `details`；不能安全映射到字段时显示统一校验消息。
- 会话恢复 `401`：静默清理失效会话并跳转登录页。
- 网络错误或 `5xx`：显示简洁、可重试的错误提示，不清空表单。
- 未知错误：显示统一兜底消息，开发环境保留控制台诊断信息。

用户生成内容只使用 Vue 普通文本插值，不使用 `v-html`。

## 测试策略

关键行为采用测试先行：

1. API 层测试 Bearer Token 注入、成功响应兼容和错误提取。
2. Auth Store 测试登录、注册、刷新恢复、无效 Token 清理和退出兜底。
3. 路由测试未登录拦截、已登录访问登录页、初始化等待和安全恢复原目标地址。
4. 页面测试登录/注册切换、字段校验、提交加载状态和后端错误反馈。
5. 生产构建验证 TypeScript、Vue SFC 和资源打包。

阶段验收命令：

```powershell
cd D:\TeamFlow\frontend
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cd D:\TeamFlow
python -m pytest tests -v
```

实现完成后启动 Vite 开发服务器，分别检查桌面和移动视口，确认表单、文字、按钮和应用壳层无重叠、裁切或路由循环。

## 文档更新

根 README 增加前端安装、环境变量、启动、测试和构建说明，并明确：

- 后端需要运行在 `VITE_API_BASE_URL` 指向的地址。
- 服务端退出撤销尚未实现。
- 本阶段只完成认证闭环和 Dashboard 应用壳层。

## 剩余风险

- `localStorage` Token 会受到同源 XSS 风险影响；长期方案需要后端支持更合适的会话策略或 HttpOnly Cookie。
- 服务端退出接口不撤销 JWT，已泄露 Token 在过期前仍可使用。
- 本阶段不验证真实项目接口，因此 Dashboard 到项目列表的集成风险留到下一阶段。
- 当前没有有效 Git 仓库，无法通过提交记录隔离或审计本轮文件变化。
- 浏览器端到端联调依赖本地 FastAPI 服务可用和 CORS 配置允许 Vite 开发地址。

## 完成标准

- `frontend/` 能安装依赖并启动。
- 用户可以注册、登录、刷新恢复身份和客户端退出。
- 未登录用户不能访问 `/dashboard`。
- 已登录用户不会停留在 `/login`。
- Axios 自动附加 Bearer Token，并正确处理会话失效。
- lint、类型检查、前端测试、生产构建和后端回归测试全部通过。
- 桌面与移动视口完成浏览器检查，认证页符合已确认的分栏方向。
