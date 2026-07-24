TeamFlow
AI 驱动的智能任务协作平台
项目技术文档  v1.0
开发方式：Codex + Cursor AI 驱动全栈开发
2025 年 7 月
一、项目概述
1.1 项目背景
小型团队（5-30 人）的项目管理长期依赖于微信群、Excel 和口头沟通，存在任务分配不清晰、进度不可视、历史记录难追溯三大痛点。市面上虽有 Jira、Asana 等专业工具，但学习成本高、价格昂贵，对小型团队不友好。
TeamFlow 定位为轻量级、零学习成本的团队协作工具，以 Kanban 看板为核心交互，覆盖项目创建、任务分配、进度追踪和数据统计的全流程。
1.2 核心价值
本项目是 AI 驱动全栈开发的完整实践案例。从需求分析、数据库建模、API 设计到前后端开发和 Docker 部署，全程以 Codex 和 Cursor 为核心开发工具，完整验证了"需求拆解 → Prompt 设计 → AI 代码生成 → 人工校验重构 → 自测联调 → 上线部署"的开发范式。
二、系统架构
2.1 整体架构
系统采用前后端分离的三层架构：
2.2 模块架构
系统分为六大功能模块，模块间通过 REST API 解耦：
三、数据库设计
3.1 核心表结构
3.2 拖拽排序设计
Kanban 三列各自维护独立的 sort_order 序列。拖拽事件触发后，前端捕获所有排序变化，通过单次 PATCH 请求批量更新涉及列的 sort_order 值，避免逐条更新的 N+1 问题。
当任务跨列移动时（如从 todo 拖到 in_progress），同时更新 status 字段和 sort_order，后端在同一事务内完成两步操作，保证数据一致性。
3.3 Redis 缓存策略
-  用户会话：JWT token 黑名单，登出时写入 Redis，TTL 与 token 过期时间一致
-  任务列表：项目任务列表缓存，TTL 5 分钟，拖拽/修改操作后立即失效
-  统计聚合：看板统计数据每小时重算一次，避免高频查询
四、API 设计
4.1 核心接口
4.2 统一响应格式
所有 API 返回统一 JSON 格式：
{
  "code": 0,           // 0=成功, 非0=错误码
  "message": "ok",
  "data": { ... }      // 业务数据
}
五、前端设计
5.1 页面结构
前端为 Vue3 单页应用（SPA），使用 Vue Router 管理路由，Pinia 管理全局状态。
5.2 拖拽排序实现
使用 SortableJS 库实现任务卡片的拖拽交互。核心实现要点：
-  列内排序：监听 onEnd 事件，获取排序后的任务 ID 列表，计算新的 sort_order 数组，调用批处理接口
-  跨列移动：同步更新目标列的 sort_order 并修改任务 status 字段
-  性能优化：使用防抖（debounce 200ms）避免高频请求，本地先行更新 UI 再异步提交后端
六、安全设计
-  密码安全：bcrypt + salt 哈希存储，迭代次数 12，永不明文落盘
-  接口鉴权：JWT 中间件拦截所有需要认证的接口；Token 过期后 401，前端自动跳转登录
-  越权防护：每个涉及项目/任务的操作先校验当前用户是否为项目成员，非成员返回 403
-  SQL 注入：全程使用 SQLAlchemy ORM 参数化查询，禁止原生 SQL 字符串拼接
-  XSS 防护：前端统一使用 v-text 渲染用户生成内容，避免 v-html 引入 XSS 风险
-  输入消毒：Pydantic 模型对所有输入字段进行类型校验和长度限制，拒绝超长/异常输入
-  速率限制：登录接口每 IP 每分钟限 5 次，防止暴力破解
七、部署架构
使用 Docker Compose 编排全部 5 个服务，单个 docker-compose.yml 文件定义所有服务的镜像、网络、环境变量和健康检查策略。通过 GitHub Actions 监听 main 分支 push 事件，自动构建镜像并部署至阿里云 ECS。
八、AI 驱动开发流程
本项目是 AI 驱动全栈开发的核心实践案例。以下是完整的开发方法论：
8.1 Prompt 分层设计
每个功能模块按照"数据模型 → API 端点 → 前端组件 → 联调测试"四层结构编写 Prompt：
-  第一层 — 数据建模："为任务管理系统设计 task 表的 SQLAlchemy 模型，包含字段 X/Y/Z，关联关系为...，请输出完整的 model 代码和 Alembic 迁移文件"
-  第二层 — API 端点："基于上述 task 模型，创建 FastAPI CRUD 端点，包含分页查询、按项目筛选、鉴权中间件、统一异常处理，输入输出使用 Pydantic schema"
-  第三层 — 前端组件："创建 Vue3 任务看板组件，三列布局，使用 Element Plus 卡片组件，集成 SortableJS 拖拽，支持按负责人/优先级筛选"
-  第四层 — 联调测试："编写任务看板拖拽排序的自测用例，覆盖正常拖拽、跨列移动、空列表、并发冲突场景"
8.2 AI 生成代码审查清单
所有 AI 生成代码在入库前通过以下清单逐项审查：
-  接口鉴权：每个 API 端点是否都标注了依赖 Depends(get_current_user)
-  越权访问：用户是否能通过修改 task_id 访问非自己项目的任务
-  SQL 查询：是否存在 N+1 查询（未使用 joinedload/selectinload）、是否存在原生 SQL 拼接
-  异常处理：try-except 块是否完整，异常信息是否向客户端泄露内部细节
-  前端安全：是否存在 v-html 渲染用户输入、是否存在未消毒的 URL 跳转
-  接口格式：所有 API 返回是否统一为 {code, message, data} 格式
九、开发计划
MVP 总工期：约 6 天
十、技术栈总览

*—— 本项目以 Codex + Cursor 为 AI 开发核心，从需求分析到代码生成、安全审查、部署上线，全程由 AI 辅助完成 ——*

| 层级 | 组件 | 职责 |
|---|---|---|
| 前端层 | Vue3 SPA + Pinia + Element Plus | 用户交互、看板拖拽、数据可视化 |
| 服务层 | Python FastAPI | REST API、JWT 鉴权、业务逻辑、缓存管理 |
| 数据层 | MySQL 8.0 + Redis | 持久化存储、会话缓存、热点数据加速 |


| 模块 | 核心功能 | 技术要点 |
|---|---|---|
| 用户认证 | 注册、登录、JWT 签发与校验、登出 | bcrypt 密码哈希、Redis 黑名单、中间件鉴权 |
| 项目管理 | 创建项目、邀请成员、角色分配（负责人/成员） | 多对多关系建模、邀请码生成与校验 |
| 任务看板 | 三列 Kanban、CRUD、拖拽排序、筛选 | SortableJS 拖拽、PATCH 批量更新、防抖节流 |
| 评论动态 | 任务评论、@提及、活动时间线 | 嵌套关联查询、WebSocket 实时推送（可选） |
| 权限控制 | 项目级 RBAC：负责人/成员/访客 | 装饰器权限校验、越权访问拦截 |
| 数据统计 | 任务完成率、个人工作量、团队趋势 | ECharts 图表、聚合查询、定时计算 |


| 表名 | 核心字段 | 说明 |
|---|---|---|
| users | id, username, email, password_hash, avatar, created_at | 用户基础信息，密码 bcrypt 哈希存储 |
| projects | id, name, description, owner_id, invite_code, created_at | 项目信息，owner 拥有最高权限 |
| project_members | project_id, user_id, role(owner/admin/member) | 项目-用户多对多关联，含角色 |
| tasks | id, project_id, title, description, status(todo/in_progress/done), priority, assignee_id, sort_order, due_date | 任务主表，status 对应看板列，sort_order 用于排序 |
| comments | id, task_id, user_id, content | 任务评论，级联查询 |
| activity_logs | id, project_id, user_id, action, target_type, target_id | 操作日志，用于动态时间线 |


| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/auth/register | 用户注册，返回 JWT |
| POST | /api/auth/login | 用户登录 |
| POST | /api/auth/logout | 登出，token 入黑名单 |
| GET | /api/projects | 获取用户参与的项目列表 |
| POST | /api/projects | 创建项目 |
| POST | /api/projects/{id}/join | 通过邀请码加入项目 |
| GET | /api/projects/{id}/tasks | 获取项目任务列表（含筛选参数） |
| POST | /api/projects/{id}/tasks | 创建任务 |
| PUT | /api/tasks/{id} | 更新任务（含状态变更） |
| PATCH | /api/tasks/batch-order | 批量更新排序（含跨列） |
| POST | /api/tasks/{id}/comments | 添加评论 |
| GET | /api/projects/{id}/stats | 获取项目统计数据 |


| 路由 | 页面 | 核心组件 |
|---|---|---|
| /login | 登录注册页 | 表单校验、验证码倒计时 |
| /dashboard | 仪表盘 | 项目列表卡片、统计数据概览 |
| /project/:id | 项目看板 | 三列 Kanban、任务卡片、筛选栏 |
| /project/:id/task/:tid | 任务详情 | 描述、评论、操作日志 |
| /project/:id/settings | 项目设置 | 成员管理、邀请链接 |
| /project/:id/stats | 数据统计 | ECharts 图表、导出 |


| 服务 | 技术 | 端口 |
|---|---|---|
| Nginx（反向代理） | 静态文件 + API 代理 | 80/443 |
| 前端 | Vue3 构建产物，Nginx 托管 | — |
| 后端 | Uvicorn + FastAPI | 8000（内部） |
| MySQL | 数据库 | 3306（内部） |
| Redis | 缓存 + 会话 | 6379（内部） |


| 阶段 | 内容 | 工期 |
|---|---|---|
| P0 | 项目脚手架：Vue3 + FastAPI 初始化、数据库建表、Docker 环境 | 0.5 天 |
| P1 | 用户系统：注册登录、JWT 鉴权、Redis 会话管理 | 1 天 |
| P2 | 项目管理：CRUD、成员邀请、权限控制 | 1 天 |
| P3 | 任务看板：三列 Kanban + 拖拽排序 + 筛选 | 1.5 天 |
| P4 | 评论 + 统计：评论模块、ECharts 数据看板 | 1 天 |
| P5 | 联调 + UI 收尾 | 0.5 天 |
| P6 | Docker 部署 + GitHub Actions CI/CD | 0.5 天 |


| 层级 | 技术选型 | 版本 |
|---|---|---|
| 前端框架 | Vue3 + Pinia | 3.4+ |
| UI 组件 | Element Plus | 2.5+ |
| 拖拽库 | SortableJS | 1.15+ |
| 图表库 | ECharts | 5.4+ |
| 后端框架 | Python FastAPI | 0.110+ |
| ORM | SQLAlchemy 2.0 | 2.0+ |
| 数据库 | MySQL | 8.0 |
| 缓存 | Redis | 7.0+ |
| 部署 | Docker Compose + Nginx | — |
| CI/CD | GitHub Actions | — |
| 云服务 | 阿里云 ECS（2核4G） | — |
| AI 工具 | Codex / Cursor | — |
