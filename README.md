# TeamFlow

> 面向小团队的全栈项目协作与 Kanban 任务管理应用。

TeamFlow 把账号、项目成员和任务流放在一个安静、清晰的工作空间中。用户可以创建项目，也可以通过项目 ID 与邀请码加入团队，并在三列 Kanban 看板上共同推进任务。

仓库包含可运行的 Vue 3 前端、FastAPI 后端、数据库迁移、自动化测试和工程文档，不是只有静态页面的界面示例。

## 项目亮点

- **完整认证流程**：支持注册、登录、当前用户恢复、受保护路由和退出登录。
- **真实项目协作**：创建者自动成为项目负责人，其他用户可通过项目 ID 和邀请码加入。
- **三列 Kanban**：任务在“待办”“进行中”“已完成”之间流转。
- **任务管理**：支持创建、编辑、删除、优先级、负责人、描述和状态设置。
- **快速筛选**：可按项目成员和任务优先级筛选；筛选期间会暂停排序，避免误改隐藏任务的顺序。
- **持久化排序**：使用 SortableJS 完成同列排序与跨列移动，刷新页面后仍从后端读取最新顺序。
- **键盘操作**：任务支持 `Alt + 方向键` 排序，为拖拽操作提供等价的键盘路径。
- **响应式工作区**：桌面端同时展示三列，移动端只在看板区域内横向滚动，不撑宽整个页面。
- **权限与状态隔离**：项目数据按登录身份加载，切换账号时会清理上一会话的项目和看板状态。

## 界面预览

TeamFlow 当前包含三个主要页面：

| 页面 | 路由 | 用途 |
| --- | --- | --- |
| 账号入口 | `/login` | 注册、登录并恢复已有会话 |
| 项目工作区 | `/dashboard` | 查看、创建或加入项目 |
| 项目看板 | `/project/:id` | 管理成员任务、筛选和排序 |

启动项目后，可以从 `http://127.0.0.1:5173` 进入完整应用。正式产品截图尚未加入仓库；后续截图资源将统一放在 `docs/images/`，避免 README 依赖本机服务或失效的外部图片。

## 技术栈

**前端**

- Vue 3 + TypeScript
- Vite + Vue Router
- Pinia
- Element Plus
- Axios
- SortableJS

**后端**

- Python 3.11
- FastAPI
- SQLAlchemy 2.0
- Alembic
- Pydantic Settings
- JWT + bcrypt

**数据与运行环境**

- SQLite：本地开发的最短启动路径
- MySQL：Docker Compose 和共享环境
- Redis：配置已预留，当前业务尚未使用缓存或令牌黑名单

**工程质量**

- Vitest + Vue Test Utils
- Pytest + HTTPX
- ESLint + vue-tsc
- 前后端运行时响应校验与异步竞态测试

## 快速开始

### 环境要求

- Python `3.11`
- Node.js `>=22.12.0 <23`
- pnpm `>=11.9.0 <12`

### 1. 启动后端

在仓库根目录执行：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

打开 `.env`，完成两项本地配置：

1. 将 `JWT_SECRET_KEY` 的占位值替换为独立生成的强随机密钥。
2. 启用 SQLite：

```env
DATABASE_URL=sqlite:///./teamflow.db
```

执行数据库迁移并启动 API：

```powershell
python -m alembic upgrade head
uvicorn app.main:app --reload
```

后端地址：

- API：`http://127.0.0.1:8000`
- Swagger：`http://127.0.0.1:8000/docs`
- ReDoc：`http://127.0.0.1:8000/redoc`

### 2. 启动前端

新开一个终端：

```powershell
cd frontend
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

前端默认使用：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

打开终端中 Vite 输出的地址，通常是 `http://127.0.0.1:5173`。如果端口被占用，Vite 会自动选择其他端口；此时需要确保后端 CORS 配置包含实际前端源地址。

## Docker Compose

Docker Compose 会启动 FastAPI、MySQL 和 Redis：

```powershell
Copy-Item .env.example .env
docker compose up --build
```

启动共享或非一次性环境前，必须替换 `.env` 中的 JWT 密钥占位值。Docker Compose 更适合集成环境；第一次体验项目仍推荐使用 SQLite 本地流程。

## 项目结构

```text
TeamFlow/
├── app/                     # FastAPI 应用、路由、模型和 Schema
├── alembic/                 # 数据库迁移及版本记录
├── frontend/                # Vue 3 前端应用与组件测试
├── tests/                   # 后端接口和权限测试
├── docker-compose.yml       # FastAPI、MySQL、Redis 编排
└── TeamFlow_项目技术文档.md  # 项目技术设计说明
```

## 质量状态

最近一次完整验证结果：

- 前端：`24` 个测试文件，`499` 项测试通过。
- 后端：`30` 项测试通过。
- ESLint：零警告通过。
- TypeScript：`vue-tsc` 类型检查通过。
- 生产构建：Vite 构建通过。

常用检查命令：

```powershell
python -m pytest tests -v
cd frontend
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

测试覆盖认证、跨账号状态隔离、项目成员权限、任务 CRUD、筛选、同列/跨列排序、异步请求竞态、移动端布局契约、评论权限、项目统计和活动日志。

## API 与项目文档

运行后端后，推荐通过 Swagger 查看最新接口定义：

- [Swagger UI](http://127.0.0.1:8000/docs)
- [OpenAPI JSON](http://127.0.0.1:8000/openapi.json)
- [ReDoc](http://127.0.0.1:8000/redoc)

仓库内技术文档：

- [项目技术文档](TeamFlow_项目技术文档.md)

当前后端提供认证、项目、成员、任务、批量排序、评论、统计和活动日志接口。README 不重复维护每个请求体和响应体，以运行中的 OpenAPI 文档和当前代码为准。

## 当前边界

- 退出登录会删除客户端令牌，但服务端尚未撤销未过期的 JWT。
- Redis 配置已存在，当前尚未用于缓存、会话或 JWT 黑名单。
- MySQL 下评论到任务的外键未配置级联删除，删除带评论任务可能失败。
- 任务表单只展示项目成员，但后端尚未强制 `assignee_id` 必须属于该项目。
- 多客户端同时排序时没有版本号或冲突检测，采用最后写入者覆盖。
- 项目角色已包含 `owner`、`admin`、`member`，多数接口当前只检查项目成员身份。
- 评论、项目统计和活动日志后端接口已完成，但尚未接入当前前端界面。
- `/health` 返回配置状态，不执行数据库或 Redis 的实时连通性探测。

## 许可证

本仓库暂未声明开源许可证。在添加明确的 `LICENSE` 文件之前，请不要默认将代码用于商业分发、再许可或公开衍生项目。
