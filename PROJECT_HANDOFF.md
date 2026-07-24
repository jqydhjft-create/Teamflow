# TeamFlow 项目交接文档

更新时间：2026-07-24

工作目录：`D:\TeamFlow`

## 新对话启动提示词

将下面这段内容直接发送到新的 Codex 对话即可继续推进：

```text
请继续推进 D:\TeamFlow 项目。

开始工作前请完整阅读：
1. D:\TeamFlow\PROJECT_HANDOFF.md
2. D:\TeamFlow\README.md
3. D:\TeamFlow\TeamFlow_项目技术文档.md

以当前代码为唯一实现事实，不要重复开发已经完成的后端接口，不要覆盖现有用户修改。先检查当前文件状态并运行测试建立基线。

当前推荐任务：按技术文档启动 TeamFlow Vue3 前端，先完成前端脚手架、路由、Pinia、Axios API 层和注册/登录/当前用户鉴权闭环，再进入项目列表与 Kanban 看板。前端技术栈优先遵循项目技术文档：Vue3、Vite、TypeScript、Vue Router、Pinia、Element Plus；HTTP 使用 Axios。实现前先检查仓库中是否已经出现新的前端文件，如果有则在现有实现上继续。

每完成一个阶段都要运行对应测试或构建检查，并说明修改文件、验证结果和剩余风险。
```

如果新对话准备继续强化后端，而不是启动前端，可把“当前推荐任务”替换为本文“后端待办”中的具体条目。

## 项目目标

TeamFlow 是面向 5-30 人小型团队的轻量级任务协作平台，以三列 Kanban 看板为核心，覆盖：

- 用户注册、登录和 JWT 鉴权。
- 项目创建、邀请码加入和成员协作。
- 任务创建、更新、删除、筛选和拖拽排序。
- 任务评论和项目活动时间线。
- 项目任务完成率、状态分布和负责人工作量统计。
- 最终通过 Docker Compose 部署前端、后端、MySQL、Redis 和 Nginx。

原始产品与技术规划见 `D:\TeamFlow\TeamFlow_项目技术文档.md`，已实现 API 的详细说明见 `D:\TeamFlow\README.md`。

## 当前技术栈

后端当前采用：

- Python 3.11+
- FastAPI
- SQLAlchemy 2.0 ORM
- Alembic
- Pydantic 2 + pydantic-settings
- MySQL 8 + PyMySQL（目标生产数据库）
- SQLite（当前本地无 Docker 时的开发回退）
- Redis 7（已有配置和 Compose 服务，业务尚未接入）
- JWT：python-jose
- 密码哈希：直接使用 bcrypt，不使用 passlib 的 CryptContext
- pytest + FastAPI TestClient/httpx

技术文档规划但尚未建立的前端栈：

- Vue 3.4+
- Vite + TypeScript
- Vue Router
- Pinia
- Element Plus
- Axios
- SortableJS
- ECharts

## 当前目录结构

```text
D:\TeamFlow
├── app
│   ├── core          # 配置、数据库、JWT/密码、异常处理、日志
│   ├── models        # SQLAlchemy 模型
│   ├── routers       # root、auth、projects、tasks 路由
│   ├── schemas       # Pydantic 请求/响应模型
│   └── main.py       # FastAPI 入口
├── alembic
│   ├── versions      # 数据库迁移
│   └── env.py
├── tests             # 后端测试
├── docs              # 设计、计划和 Codex 工作流文档
├── output            # 已生成的 PDF 等产物
├── README.md         # 完整后端 API 与启动文档
├── PROJECT_HANDOFF.md
├── TeamFlow_项目技术文档.md
├── requirements.txt
├── .env.example
├── Dockerfile
└── docker-compose.yml
```

当前没有前端应用目录。新建前先再次检查，避免与用户在新对话前添加的文件冲突。建议前端目录使用 `frontend/`。

## 已完成能力

### 基础设施

- FastAPI 应用入口、生命周期和路由注册已完成。
- `.env` 配置由 pydantic-settings 读取。
- MySQL 连接池参数已配置，包括 `pool_size`、`max_overflow`、`pool_recycle` 和 `pool_pre_ping`。
- SQLite 本地开发回退已支持，当前本地 `.env` 使用 `DATABASE_URL=sqlite:///./teamflow.db`。
- CORS、统一异常处理和日志配置已接入。
- Docker Compose 当前包含 backend、mysql、redis 三个服务。
- Alembic 能从 `get_settings().resolved_database_url` 获取数据库连接地址。

### 用户认证

- 注册：`POST /api/auth/register`
- 登录：`POST /api/auth/login`
- 当前用户：`GET /api/auth/me`
- 受保护接口示例：`GET /api/auth/protected`
- 退出占位接口：`POST /api/auth/logout`
- bcrypt 密码哈希与校验。
- python-jose JWT 签发与解析，默认有效期 7 天。
- OAuth2 Bearer Header 解析和数据库用户查询。

### 项目管理

- 创建项目，创建者自动成为 `owner`。
- 查询当前用户参与的项目。
- 通过邀请码加入项目，重复加入保持幂等。
- 查询项目详情。
- 查询项目成员列表。
- 项目级成员身份校验。
- 项目角色模型已预留 `owner`、`admin`、`member`。

### 任务管理

- 创建任务。
- 查询项目任务列表。
- 按 `status`、`priority`、`assignee_id` 筛选。
- 查询任务详情。
- 完整更新任务。
- 删除任务。
- 批量修改状态与 `sort_order`，支持看板跨列移动。
- `todo`、`in_progress`、`done` 各状态独立计算新增任务顺序。
- 任务列表和详情返回 `comment_count`。

### 评论、统计和活动日志

- 创建、查询和删除任务评论。
- 评论作者或项目所有者可以删除评论。
- 项目统计包含任务总数、完成数、完成率、状态分布和负责人分布。
- 项目活动日志查询已完成。
- 当前记录 `task_created`、`task_updated`、`comment_created` 三种动作。

## 已注册接口

公开系统接口：

- `GET /`
- `GET /health`

认证接口：

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/protected`

项目接口：

- `POST /api/projects`
- `GET /api/projects`
- `POST /api/projects/{project_id}/join`
- `GET /api/projects/{project_id}`
- `GET /api/projects/{project_id}/members`
- `GET /api/projects/{project_id}/stats`
- `GET /api/projects/{project_id}/activity-logs`
- `POST /api/projects/{project_id}/tasks`
- `GET /api/projects/{project_id}/tasks`

任务和评论接口：

- `GET /api/tasks/{task_id}`
- `PUT /api/tasks/{task_id}`
- `DELETE /api/tasks/{task_id}`
- `PATCH /api/tasks/batch-order`
- `POST /api/tasks/{task_id}/comments`
- `GET /api/tasks/{task_id}/comments`
- `DELETE /api/tasks/{task_id}/comments/{comment_id}`

所有请求体、响应示例、字段限制和权限规则都已集中记录在 `D:\TeamFlow\README.md`。前端对接时不要根据本交接文档猜测字段，应优先查 README、Schema 和运行时 `/openapi.json`。

## 数据库与迁移

当前数据库表：

- `users`
- `projects`
- `project_members`
- `tasks`
- `comments`
- `activity_logs`
- `alembic_version`

当前有效迁移链：

```text
9b8238a52671 (users)
  -> 67b134328b93 (projects, project_members, tasks)
  -> cbb215ca4f3e (activity_logs, comments)
```

迁移文件：

- `D:\TeamFlow\alembic\versions\9b8238a52671_create_users_table.py`
- `D:\TeamFlow\alembic\versions\67b134328b93_add_projects_and_tasks_tables.py`
- `D:\TeamFlow\alembic\versions\cbb215ca4f3e_add_activity_logs_table.py`

迁移命令：

```powershell
python -m alembic upgrade head
```

注意：文件扫描结果曾显示 `alembic\versions\__pycache__\ec0f966280db_create_users_table...pyc`，但没有对应的 `.py` 迁移源文件。不要从 `__pycache__` 推断有效迁移；Alembic 只以现有 `.py` 迁移链为准。

## 关键实现决策

- 统一业务响应目标为 `{"code": 0, "message": "ok", "data": ...}`。
- `GET /api/auth/me` 当前缺少 `message` 字段，系统根接口和健康接口也未使用统一业务包装。
- HTTP 错误由统一异常处理转换为 `{"code": "http_error", "message": ...}`。
- 参数校验错误返回 `422`、`validation_error` 和 `details`。
- JWT 的用户 ID 存在 `sub` 中，读取后再查数据库，避免直接信任令牌中的用户对象。
- 密码函数直接调用 `bcrypt.hashpw` 和 `bcrypt.checkpw`；不要未经验证切回 passlib，之前曾遇到 bcrypt/passlib 兼容问题。
- 项目成员关系是当前主要授权边界。大多数任务操作只要求是项目成员，不区分 owner/admin/member。
- 评论删除是例外：只有评论作者或项目 owner 可以删除。
- 批量排序在同一数据库事务内更新请求中的任务。
- 任务响应中的评论数由查询实时聚合，不存储冗余计数字段。

## 当前验证基线

2026-07-24 最近一次完整验证：

```text
python -m pytest tests -v
28 passed in 8.21s
```

测试覆盖：

- 应用根接口、健康接口和配置。
- 项目创建、列表、加入、详情和成员权限。
- 任务创建、列表、独立状态排序、更新、批量排序、详情、删除和筛选。
- 评论创建、列表、评论数量和删除权限。
- 项目统计。
- 活动日志成员权限及任务/评论事件。
- Codex 工作流 PDF 结构测试。

任何新对话开始修改前，应重新运行：

```powershell
python -m pytest tests -v
```

修改前端后至少运行对应的 lint、类型检查、单元测试和生产构建；具体命令应写入前端 `package.json` 和 README。

## 已知边界与技术债

### 高优先级

- Redis 尚未接入业务。退出接口只是占位符，JWT 无服务端撤销/黑名单。
- 登录接口没有实现技术文档要求的每 IP 每分钟 5 次速率限制。
- `assignee_id` 没有校验用户是否为项目成员，可能把任务分配给项目外用户。
- 项目角色未形成完整 RBAC；目前普通成员也能修改或删除任意项目任务。
- 前端尚未创建，当前无法形成端到端产品体验。

### 中优先级

- `GET /api/auth/me` 响应缺少统一的 `message` 字段。
- 任务列表的 `status` 和 `priority` 查询参数未做枚举校验，无效值通常返回空列表。
- 任务更新是全量 `PUT`，没有部分字段更新接口。
- 删除任务、删除评论、创建项目、加入项目不记录活动日志。
- 活动日志不包含变更前后内容，只保存动作、目标类型和目标 ID。
- `/health` 仅暴露配置，不实际探测数据库和 Redis 连通性。
- Redis 任务列表缓存和统计缓存均未实现。
- 数据库模型缺少技术文档规划的用户头像和任务截止时间字段。

### 部署与工程化

- Docker Compose 只有 backend、mysql、redis，技术文档规划的 frontend 和 nginx 尚未加入。
- 尚未建立 GitHub Actions CI/CD。
- 尚未实现生产环境反向代理、HTTPS 和健康检查编排。
- 根目录 `.git` 当前是空目录，执行 `git status` 会报告“not a git repository”。交接和变更追踪暂时不能依赖 Git；不要擅自删除或重建 `.git`，应先由项目所有者确认版本库来源或远端地址。
- `requirements.txt` 仍包含 `passlib[bcrypt]`，但代码已不再使用 passlib。清理依赖前先确认没有外部脚本依赖它。

## 推荐推进顺序

### 下一步：前端基础与认证闭环

建议先建立 `frontend/`，目标是让用户可以实际注册、登录并进入受保护页面：

1. 使用 Vue3 + Vite + TypeScript 创建前端工程。
2. 接入 Vue Router、Pinia、Element Plus 和 Axios。
3. 建立环境变量，例如 `VITE_API_BASE_URL=http://127.0.0.1:8000`。
4. 建立 Axios 实例，自动附加 Bearer Token，并统一处理 `401`。
5. 建立认证 Store，管理 token、当前用户、登录、注册和退出。
6. 实现 `/login` 页面和路由守卫。
7. 使用 `/api/auth/register`、`/api/auth/login`、`/api/auth/me` 完成真实联调。
8. 增加必要的单元测试和生产构建验证。

前端落地后，依次实现：

1. `/dashboard`：项目列表、创建项目、邀请码加入项目。
2. `/project/:id`：三列 Kanban、筛选、任务新增与编辑。
3. SortableJS 拖拽，并对接 `PATCH /api/tasks/batch-order`。
4. 任务详情与评论。
5. 项目成员、活动时间线和 ECharts 统计页。
6. 响应式布局、空状态、加载状态和错误反馈。

### 后端加固

建议在前端主流程可用后按风险推进：

1. 为 `assignee_id` 增加项目成员校验和测试。
2. 明确 owner/admin/member 的操作矩阵并实施 RBAC。
3. 接入 Redis JWT 黑名单，补全真正的退出登录。
4. 增加登录速率限制。
5. 统一所有业务响应结构。
6. 扩充活动日志事件和变更详情。
7. 增加分页、搜索和并发排序冲突策略。
8. 实现真实数据库/Redis 健康探测。

### 部署收尾

1. 为前端建立多阶段 Dockerfile。
2. 在 Compose 中加入 frontend/nginx 和健康检查。
3. 增加生产环境变量策略和密钥管理。
4. 建立 GitHub Actions：测试、构建镜像、部署。
5. 在目标 ECS 环境验证数据库迁移、反向代理和 HTTPS。

## 工作约束与注意事项

- 工作区可能包含用户改动，不要回滚、覆盖或清理不属于当前任务的文件。
- 修改前先读取实际代码，不要只依赖本交接文档；文档可能落后于新对话期间的用户修改。
- 手工编辑文件使用补丁方式，避免无关的整文件重写。
- 数据库结构变化必须同时更新 SQLAlchemy 模型、Alembic migration 和测试。
- 新接口必须包含鉴权、越权测试、参数校验和统一响应。
- 新增依赖后同步更新依赖清单和 Docker 构建。
- 不要输出或提交 `.env` 中的真实密钥；文档只能引用 `.env.example`。
- 不要把 SQLite 本地行为直接等同于 MySQL 生产行为，涉及外键、时间、事务和索引时要做 MySQL 验证。
- 继续使用 `Authorization: Bearer <token>` 对接受保护接口。

## 常用命令

安装依赖：

```powershell
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

本地 SQLite：

```env
DATABASE_URL=sqlite:///./teamflow.db
```

迁移数据库：

```powershell
python -m alembic upgrade head
```

启动后端：

```powershell
uvicorn app.main:app --reload
```

运行测试：

```powershell
python -m pytest tests -v
```

启动 Compose：

```powershell
docker compose up --build
```

接口文档：

- Swagger UI：`http://127.0.0.1:8000/docs`
- OpenAPI JSON：`http://127.0.0.1:8000/openapi.json`
- ReDoc：`http://127.0.0.1:8000/redoc`

## 交接完成标准

新对话在开始开发前应确认：

- 已读取本交接文档、README 和项目技术文档。
- 已检查当前目录是否出现新的前端或后端改动。
- 已重新运行后端测试并记录基线。
- 已明确本轮只做前端、后端加固或部署中的一个可验证阶段。
- 已为本轮修改定义测试或构建验收命令。

完成上述检查后，从“前端基础与认证闭环”开始推进，是当前最连贯的下一步。
