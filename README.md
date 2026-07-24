# TeamFlow Backend

TeamFlow 后端基于 Python 3.11、FastAPI、SQLAlchemy 2.0 和 Alembic 构建，当前已完成用户认证、项目协作、任务管理、评论、项目统计和活动日志接口。

## 快速开始

### 本地运行（SQLite）

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
Copy-Item .env.example .env
```

`.env.example` 中的 `JWT_SECRET_KEY` 只是明确的占位值。任何共享环境或非一次性部署都必须在启动前将其替换为独立生成、不可预测的强随机密钥；不要提交真实密钥，也不要在不同环境间复用。

在 `.env` 中启用 SQLite：

```env
DATABASE_URL=sqlite:///./teamflow.db
```

执行迁移并启动服务：

```powershell
python -m alembic upgrade head
uvicorn app.main:app --reload
```

### Docker Compose 运行

准备 `.env` 后启动 backend、MySQL 和 Redis：

```powershell
Copy-Item .env.example .env
docker compose up --build
```

启动任何共享或非一次性 Docker 部署前，同样必须先将 `.env` 中的 `JWT_SECRET_KEY` 占位值替换为独立生成的强随机密钥。

默认地址：

- API：`http://127.0.0.1:8000`
- Swagger UI：`http://127.0.0.1:8000/docs`
- OpenAPI JSON：`http://127.0.0.1:8000/openapi.json`
- ReDoc：`http://127.0.0.1:8000/redoc`

## 前端应用

前端位于 `frontend` 目录，运行环境要求 Node.js `>=22.12.0 <23` 和 pnpm `>=11.9.0 <12`。

安装依赖并准备本地环境变量：

```powershell
cd frontend
pnpm install
Copy-Item .env.example .env.local
```

`VITE_API_BASE_URL` 用于配置后端服务的基础地址。前端代码未提供该变量时默认使用 `http://127.0.0.1:8000`；各 API 请求路径已包含 `/api` 前缀，因此自定义时应填写后端源地址，例如：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

启动开发服务器：

```powershell
pnpm dev
```

当前页面路由：

- `/login`：登录与注册。
- `/dashboard`：真实项目目录，可查看当前用户参与的项目，并创建或加入项目。
- `/project/:id`：项目三列 Kanban 看板，固定包含 `todo`（待办）、`in_progress`（进行中）和 `done`（已完成）三列。

项目目录与看板已对接当前后端接口：

- 创建项目时名称必填、描述可选；创建者自动成为项目 `owner`。
- 加入项目必须同时填写正整数项目 ID 和邀请码，不能只凭邀请码加入。
- 项目列表显示当前用户在各项目中的真实角色，例如 `owner`、`admin` 或 `member`。
- 看板支持创建、完整编辑和删除任务。任务状态为 `todo`、`in_progress`、`done`，优先级为 `low`、`medium`、`high`，负责人可选或设为未分配。
- 支持按项目成员和优先级筛选任务。任一筛选激活时会明确禁用鼠标拖拽和键盘排序，清空筛选并恢复完整任务列表后重新启用排序。
- 看板使用 SortableJS，支持同列排序和跨列移动；每次排序会批量提交受影响列的状态与 `sort_order`，刷新后仍从后端读取已持久化顺序。

常用质量检查命令需在 `frontend` 目录中分别运行：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

联调前需先启动后端，默认地址为 `http://127.0.0.1:8000`。Vite 开发服务器通常运行在 `http://localhost:5173`；请确保后端 `.env` 的 `BACKEND_CORS_ORIGINS` 包含实际使用的前端源地址（协议、主机和端口必须一致），然后重启后端使配置生效。

当前前端实现仍有以下边界：

- JWT 保存在浏览器 `localStorage` 中。退出登录会请求后端占位接口并删除客户端令牌，但服务端不会撤销 JWT，尚未过期的令牌仍可被后端接受。
- MySQL 中评论到任务的外键未配置级联删除，删除已有评论的任务可能因外键约束失败；前端会保留任务卡片并显示失败状态。
- 任务表单只提供项目成员作为负责人选项，但后端尚未验证 `assignee_id` 是否属于该项目，客户端限制不能替代服务端校验。
- 排序接口没有版本号、乐观锁或冲突检测；多个客户端同时排序时采用最后写入者覆盖（last-writer-wins）。
- 评论、项目统计和活动时间线的后端接口已经存在，但尚未进入当前前端 UI。

## 公共约定

### 鉴权方式

除注册、登录、公开的退出登录占位接口、根接口和健康检查外，其余接口都需要 JWT。登录或注册成功后，从 `data.token` 取得令牌，并在请求头中传递：

```http
Authorization: Bearer <token>
```

访问令牌默认有效期为 7 天，由 `.env` 中的 `JWT_ACCESS_TOKEN_EXPIRE_DAYS` 配置。JWT 使用 `JWT_SECRET_KEY` 和 `JWT_ALGORITHM` 签名。

`JWT_SECRET_KEY` 必须是部署方独立生成的强随机密钥。仓库 `.env.example` 中的值仅用于提醒配置，不能作为共享环境、测试环境或生产环境的实际密钥。

### 成功响应

业务接口通常使用统一响应结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

说明：`GET /api/auth/me` 当前实现中没有 `message` 字段；`/` 和 `/health` 是系统接口，不使用业务响应包装。

### 错误响应

HTTP 业务错误：

```json
{
  "code": "http_error",
  "message": "Forbidden"
}
```

请求参数校验失败：

```json
{
  "code": "validation_error",
  "message": "Request validation failed",
  "details": []
}
```

常见 HTTP 状态码：

| 状态码 | 含义 |
| --- | --- |
| `200` | 请求成功 |
| `401` | 未提供令牌、令牌无效/过期，或登录凭据错误 |
| `403` | 已登录，但不是相关项目成员或没有操作权限 |
| `404` | 项目、任务或评论不存在 |
| `409` | 用户名或邮箱已存在 |
| `422` | 请求体、路径参数或查询参数校验失败 |
| `500` | 未处理的服务器错误 |

## 接口总览

| 模块 | 方法 | 路径 | 权限 | 用途 |
| --- | --- | --- | --- | --- |
| 系统 | `GET` | `/` | 公开 | 服务基本信息 |
| 系统 | `GET` | `/health` | 公开 | 配置和依赖健康信息 |
| 认证 | `POST` | `/api/auth/register` | 公开 | 注册并获取 JWT |
| 认证 | `POST` | `/api/auth/login` | 公开 | 登录并获取 JWT |
| 认证 | `POST` | `/api/auth/logout` | 公开，占位接口 | 退出登录占位符 |
| 认证 | `GET` | `/api/auth/me` | 登录用户 | 当前用户信息 |
| 认证 | `GET` | `/api/auth/protected` | 登录用户 | 受保护接口示例 |
| 项目 | `POST` | `/api/projects` | 登录用户 | 创建项目 |
| 项目 | `GET` | `/api/projects` | 登录用户 | 我的项目列表 |
| 项目 | `POST` | `/api/projects/{project_id}/join` | 登录用户 + 邀请码 | 加入项目 |
| 项目 | `GET` | `/api/projects/{project_id}` | 项目成员 | 项目详情 |
| 项目 | `GET` | `/api/projects/{project_id}/members` | 项目成员 | 项目成员列表 |
| 项目 | `GET` | `/api/projects/{project_id}/stats` | 项目成员 | 项目任务统计 |
| 项目 | `GET` | `/api/projects/{project_id}/activity-logs` | 项目成员 | 活动日志 |
| 任务 | `POST` | `/api/projects/{project_id}/tasks` | 项目成员 | 创建任务 |
| 任务 | `GET` | `/api/projects/{project_id}/tasks` | 项目成员 | 查询项目任务 |
| 任务 | `GET` | `/api/tasks/{task_id}` | 项目成员 | 任务详情 |
| 任务 | `PUT` | `/api/tasks/{task_id}` | 项目成员 | 完整更新任务 |
| 任务 | `DELETE` | `/api/tasks/{task_id}` | 项目成员 | 删除任务 |
| 任务 | `PATCH` | `/api/tasks/batch-order` | 各任务所属项目成员 | 批量移动/排序任务 |
| 评论 | `POST` | `/api/tasks/{task_id}/comments` | 项目成员 | 创建评论 |
| 评论 | `GET` | `/api/tasks/{task_id}/comments` | 项目成员 | 评论列表 |
| 评论 | `DELETE` | `/api/tasks/{task_id}/comments/{comment_id}` | 评论作者或项目所有者 | 删除评论 |

## 系统接口

### `GET /`

权限：公开。

响应示例：

```json
{
  "message": "FastAPI project is running",
  "app_name": "TeamFlow API",
  "version": "0.1.0"
}
```

### `GET /health`

权限：公开。

返回当前数据库驱动、连接池参数和 Redis 地址。该接口目前反映配置状态，不会实际执行 MySQL 或 Redis 连通性探测。

## 用户认证

### `POST /api/auth/register`

权限：公开。

请求体：

```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "secret123"
}
```

字段约束：

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `username` | string | 是 | 2-20 个字符 |
| `email` | string | 是 | 合法邮箱格式 |
| `password` | string | 是 | 6-50 个字符 |

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "user": {
      "id": 1,
      "username": "alice",
      "email": "alice@example.com",
      "created_at": "2026-07-24T10:00:00"
    },
    "token": "<jwt>"
  }
}
```

用户名或邮箱已存在时返回 `409`。

### `POST /api/auth/login`

权限：公开。

请求体：

```json
{
  "username_or_email": "alice",
  "password": "secret123"
}
```

`username_or_email` 可以传用户名或邮箱，长度为 2-255 个字符；密码长度为 6-50 个字符。成功响应与注册接口相同，凭据错误返回 `401`。

### `POST /api/auth/logout`

权限：当前为公开的占位接口。

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "message": "Logout placeholder. Token revocation is not implemented yet."
  }
}
```

当前没有令牌撤销或黑名单机制。客户端退出时应自行删除本地 JWT；服务端仍会接受尚未过期的令牌。

### `GET /api/auth/me`

权限：登录用户。

```json
{
  "code": 0,
  "data": {
    "id": 1,
    "username": "alice",
    "email": "alice@example.com",
    "created_at": "2026-07-24T10:00:00"
  }
}
```

### `GET /api/auth/protected`

权限：登录用户。

用于演示业务接口如何通过 `Depends(get_current_user)` 保护。

```json
{
  "code": 0,
  "message": "鉴权通过",
  "data": {
    "user_id": "1"
  }
}
```

## 项目管理

项目角色包括 `owner`、`admin` 和 `member`。当前接口主要校验“是否为项目成员”，尚未为 `admin` 实现额外管理能力。

### `POST /api/projects`

权限：登录用户。创建者自动成为项目 `owner`，系统自动生成 6 位十六进制邀请码。

请求体：

```json
{
  "name": "TeamFlow 研发",
  "description": "后端与前端协作项目"
}
```

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `name` | string | 是 | 1-100 个字符 |
| `description` | string/null | 否 | 最多 500 个字符 |

响应 `data`：

```json
{
  "id": 1,
  "name": "TeamFlow 研发",
  "description": "后端与前端协作项目",
  "owner_id": 1,
  "invite_code": "A1B2C3",
  "created_at": "2026-07-24T10:10:00"
}
```

### `GET /api/projects`

权限：登录用户。

只返回当前用户加入的项目，按项目 ID 倒序排列。`data.items` 中每一项包含项目字段和当前用户的 `role`。

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [
      {
        "id": 1,
        "name": "TeamFlow 研发",
        "description": null,
        "owner_id": 1,
        "invite_code": "A1B2C3",
        "created_at": "2026-07-24T10:10:00",
        "role": "owner"
      }
    ]
  }
}
```

### `POST /api/projects/{project_id}/join`

权限：登录用户，并提供对应项目的邀请码。

请求体：

```json
{
  "invite_code": "A1B2C3"
}
```

邀请码长度必须为 4-12 个字符。项目不存在返回 `404`，邀请码错误返回 `403`。用户已经是成员时接口保持幂等，直接返回现有成员关系。

响应 `data`：

```json
{
  "project_id": 1,
  "user_id": 2,
  "role": "member"
}
```

### `GET /api/projects/{project_id}`

权限：项目成员。

返回项目的 `id`、`name`、`description`、`owner_id`、`invite_code` 和 `created_at`。非项目成员返回 `403`。

### `GET /api/projects/{project_id}/members`

权限：项目成员。

响应 `data`：

```json
{
  "items": [
    {
      "user_id": 1,
      "username": "alice",
      "email": "alice@example.com",
      "role": "owner"
    },
    {
      "user_id": 2,
      "username": "bob",
      "email": "bob@example.com",
      "role": "member"
    }
  ]
}
```

### `GET /api/projects/{project_id}/stats`

权限：项目成员。

完成任务指 `status == "done"`，完成率为百分比数值并保留两位小数。负责人统计当前只包含已分配给用户的任务，未分配任务不会出现在 `assignee_breakdown` 中。

响应 `data`：

```json
{
  "overview": {
    "total_tasks": 5,
    "completed_tasks": 2,
    "completion_rate": 40.0
  },
  "status_breakdown": [
    {"status": "done", "count": 2},
    {"status": "in_progress", "count": 1},
    {"status": "todo", "count": 2}
  ],
  "assignee_breakdown": [
    {"user_id": 2, "username": "bob", "count": 3}
  ]
}
```

### `GET /api/projects/{project_id}/activity-logs`

权限：项目成员。

按日志 ID 正序返回。当前记录的动作：

| `action` | `target_type` | 触发操作 |
| --- | --- | --- |
| `task_created` | `task` | 创建任务 |
| `task_updated` | `task` | 更新任务 |
| `comment_created` | `comment` | 创建评论 |

响应 `data`：

```json
{
  "items": [
    {
      "id": 1,
      "project_id": 1,
      "user_id": 1,
      "username": "alice",
      "action": "task_created",
      "target_type": "task",
      "target_id": 10,
      "created_at": "2026-07-24T10:20:00"
    }
  ]
}
```

创建/加入项目、删除任务和删除评论目前不会写入活动日志。

## 任务管理

任务状态枚举：`todo`、`in_progress`、`done`。

任务优先级枚举：`low`、`medium`、`high`。

当前权限模型允许任意项目成员创建、查看、修改、移动和删除该项目内的任务，不限制为任务负责人或项目所有者。

### `POST /api/projects/{project_id}/tasks`

权限：项目成员。

请求体：

```json
{
  "title": "完成登录页联调",
  "description": "对接注册、登录和当前用户接口",
  "status": "todo",
  "priority": "high",
  "assignee_id": 2
}
```

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `title` | string | 是 | 1-200 个字符 |
| `description` | string/null | 否 | 当前无长度限制 |
| `status` | string | 是 | `todo`、`in_progress`、`done` |
| `priority` | string | 是 | `low`、`medium`、`high` |
| `assignee_id` | integer/null | 否 | 用户 ID；当前接口未额外校验该用户是否为项目成员 |

任务在对应状态列中自动追加到末尾。响应包含 `sort_order`、`comment_count` 和 `created_at`：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": 10,
    "project_id": 1,
    "title": "完成登录页联调",
    "description": "对接注册、登录和当前用户接口",
    "status": "todo",
    "priority": "high",
    "assignee_id": 2,
    "sort_order": 1,
    "comment_count": 0,
    "created_at": "2026-07-24T10:20:00"
  }
}
```

### `GET /api/projects/{project_id}/tasks`

权限：项目成员。

可选查询参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `status` | string | 按状态过滤 |
| `priority` | string | 按优先级过滤 |
| `assignee_id` | integer | 按负责人 ID 过滤 |

示例：

```http
GET /api/projects/1/tasks?status=todo&priority=high&assignee_id=2
```

返回 `data.items`，按 `status`、`sort_order`、`id` 升序排列。每一项都包含实时计算的 `comment_count`。

注意：查询参数目前是普通字符串过滤，未使用 Schema 枚举校验；无效值通常返回空列表，而不是 `422`。

### `GET /api/tasks/{task_id}`

权限：任务所属项目的成员。

返回完整任务信息和实时评论数量。任务不存在返回 `404`，非项目成员返回 `403`。

### `PUT /api/tasks/{task_id}`

权限：任务所属项目的成员。

这是完整更新接口，请求体必须提供 `title`、`status` 和 `priority`，结构与创建任务一致。`description` 和 `assignee_id` 可传 `null`。更新成功会写入 `task_updated` 活动日志。

### `DELETE /api/tasks/{task_id}`

权限：任务所属项目的成员。

当前 MySQL 实现中，评论表到任务表的外键未配置级联删除。删除已有评论的任务可能因外键约束而失败；接口尚未自动删除关联评论，也尚未通过迁移增加级联行为。以下响应仅表示删除实际成功时的返回结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "deleted": true
  }
}
```

### `PATCH /api/tasks/batch-order`

权限：登录用户必须分别是请求中每个任务所属项目的成员。

用于看板拖拽后批量修改任务状态和顺序。

请求体：

```json
{
  "items": [
    {"task_id": 10, "status": "in_progress", "sort_order": 1},
    {"task_id": 11, "status": "todo", "sort_order": 2}
  ]
}
```

`sort_order` 必须大于等于 1。响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "updated": 2
  }
}
```

该接口当前不会写入活动日志；若处理中途发生权限或任务不存在错误，事务不会提交。

## 任务评论

### `POST /api/tasks/{task_id}/comments`

权限：任务所属项目的成员。

请求体：

```json
{
  "content": "接口已经联调通过，可以进入测试。"
}
```

`content` 必填，长度为 1-2000 个字符。成功后写入 `comment_created` 活动日志。

响应 `data`：

```json
{
  "id": 20,
  "task_id": 10,
  "user_id": 2,
  "username": "bob",
  "content": "接口已经联调通过，可以进入测试。",
  "created_at": "2026-07-24T10:30:00"
}
```

### `GET /api/tasks/{task_id}/comments`

权限：任务所属项目的成员。

返回 `data.items`，按评论 ID 正序排列。每项字段与创建评论响应相同。

### `DELETE /api/tasks/{task_id}/comments/{comment_id}`

权限：必须先是任务所属项目的成员，并且满足以下任一条件：

- 当前用户是该评论作者。
- 当前用户是项目所有者。

普通成员不能删除其他成员的评论。评论或任务不存在返回 `404`，权限不足返回 `403`。

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "deleted": true
  }
}
```

## 当前实现边界

- `POST /api/auth/logout` 尚未实现 Redis JWT 黑名单或令牌撤销。
- Redis 配置已存在，但当前业务接口尚未使用缓存或黑名单。
- 项目角色已预留 `owner`、`admin`、`member`，但大多数接口目前只检查项目成员身份。
- 任务负责人 `assignee_id` 当前未校验是否属于该项目。
- MySQL 下评论到任务的外键未配置级联删除，删除已有评论的任务可能因外键约束失败。
- 删除任务和评论当前不记录活动日志。
- `/health` 当前只返回配置信息，不执行数据库或 Redis 探活查询。

## 测试

```powershell
python -m pytest tests -v
```

测试使用独立数据库依赖覆盖，覆盖认证基础能力、项目成员权限、任务 CRUD/筛选/排序、评论权限、统计和活动日志。
