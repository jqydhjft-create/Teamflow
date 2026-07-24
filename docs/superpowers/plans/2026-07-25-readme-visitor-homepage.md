# TeamFlow Visitor-Friendly README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the backend-oriented API manual in `README.md` with a concise Chinese GitHub project homepage that helps visitors understand, run, and evaluate the complete TeamFlow application.

**Architecture:** Keep `README.md` as a navigation and onboarding layer rather than a duplicate API reference. Derive every product claim and command from current frontend routes, backend configuration, package metadata, tests, and existing technical documents; link readers to Swagger and repository documents for deeper details.

**Tech Stack:** Markdown, GitHub relative links, PowerShell startup commands, FastAPI Swagger, Vue 3/Vite/pnpm, Python/pytest, Vitest

---

## File Map

- Modify: `README.md` - visitor-facing project overview, local startup, architecture, quality status, documentation links, limitations, and license notice.
- Reference: `.env.example` - backend environment setup and secret warning.
- Reference: `frontend/.env.example` - frontend API origin configuration.
- Reference: `frontend/package.json` - Node.js, pnpm, scripts, and frontend dependencies.
- Reference: `app/main.py` and `app/routers/` - current backend capabilities and default API paths.
- Reference: `frontend/src/router/index.ts` - current user-facing routes.
- Reference: `PROJECT_HANDOFF.md` and `TeamFlow_项目技术文档.md` - project structure, implementation status, and deeper documentation.

### Task 1: Replace the API Manual with a Visitor Homepage

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Capture the facts that must remain accurate**

Run:

```powershell
rg -n 'path:|engines|packageManager|"test"|DATABASE_URL|VITE_API_BASE_URL' `
  frontend/src/router/index.ts frontend/package.json .env.example frontend/.env.example
```

Expected: routes include `/login`, `/dashboard`, and `/project/:id`; frontend requires Node `>=22.12.0 <23` and pnpm `>=11.9.0 <12`; SQLite and API base URL examples are present.

- [ ] **Step 2: Replace `README.md` with the approved homepage structure**

Write a Chinese README with these exact top-level sections and responsibilities:

```markdown
# TeamFlow

> 面向小团队的全栈项目协作与 Kanban 任务管理应用。

简短介绍完整前后端、真实项目协作和当前完成度。

## 项目亮点
列出认证、创建/邀请加入项目、三列看板、任务 CRUD、筛选、排序、响应式体验。

## 界面预览
说明登录、项目工作区和项目看板三个页面；明确正式截图后续放入 docs/images，不放空图片标签。

## 技术栈
按前端、后端、数据与工程质量四组列出当前依赖。

## 快速开始
提供 SQLite 后端和 Vue 前端的最短可执行 PowerShell 步骤。

## Docker Compose
提供环境复制和 docker compose up --build。

## 项目结构
展示 frontend、app、alembic、tests、docs、output 的职责。

## 质量状态
列出前端 24 个文件/499 项测试、后端 30 项测试及检查命令。

## API 与项目文档
链接 Swagger、TeamFlow_项目技术文档.md、PROJECT_HANDOFF.md、specs 和 plans。

## 当前边界
列出 JWT 撤销、MySQL 评论外键、负责人校验、并发排序和未接入 UI 的后端模块。

## 许可证
明确暂未声明开源许可证。
```

The opening 40 lines must identify TeamFlow as a full-stack application and cover its primary workflows. Keep the full document between 150 and 220 lines.

- [ ] **Step 3: Confirm the old API manual is gone**

Run:

```powershell
rg -n '^### `(?:GET|POST|PUT|PATCH|DELETE) ' README.md
```

Expected: no output and exit code 1, because endpoint-by-endpoint sections have been removed.

- [ ] **Step 4: Confirm the visitor-facing headings are present**

Run:

```powershell
rg -n '^# TeamFlow$|^## (项目亮点|界面预览|技术栈|快速开始|Docker Compose|项目结构|质量状态|API 与项目文档|当前边界|许可证)$' README.md
```

Expected: one H1 and all ten approved H2 sections are reported.

### Task 2: Validate Commands, Links, and Claims

**Files:**
- Modify: `README.md` only if validation reveals an inaccuracy.

- [ ] **Step 1: Verify every local Markdown link resolves**

Run:

```powershell
@'
import pathlib, re, sys
readme = pathlib.Path('README.md').read_text(encoding='utf-8')
targets = re.findall(r'\[[^]]+\]\((?!https?://|#)([^)]+)\)', readme)
missing = [target for target in targets if not pathlib.Path(target).exists()]
print({'targets': targets, 'missing': missing})
sys.exit(1 if missing else 0)
'@ | python -
```

Expected: `missing` is an empty list.

- [ ] **Step 2: Verify startup commands match project metadata**

Check that README contains all of the following literal commands and values:

```text
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m alembic upgrade head
uvicorn app.main:app --reload
cd frontend
pnpm install
Copy-Item .env.example .env.local
pnpm dev
http://127.0.0.1:8000/docs
Node.js >=22.12.0 <23
pnpm >=11.9.0 <12
```

Run:

```powershell
rg -n 'python -m venv|Activate.ps1|pip install|alembic upgrade|uvicorn app.main|pnpm install|pnpm dev|127.0.0.1:8000/docs|22.12.0|11.9.0' README.md
```

Expected: every command and version appears at least once.

- [ ] **Step 3: Verify wording does not overstate current UI functionality**

Run:

```powershell
rg -n '评论|统计|活动日志|在线演示|生产环境|MIT|Apache' README.md
```

Expected: comments, statistics, and activity logs are described as backend APIs not yet integrated into the frontend; there is no online-demo claim, production-readiness claim, or invented license.

- [ ] **Step 4: Check UTF-8 content and Markdown hygiene**

Run:

```powershell
@'
import pathlib, re, sys
text = pathlib.Path('README.md').read_text(encoding='utf-8')
checks = {
    'line_count': 150 <= len(text.splitlines()) <= 220,
    'one_h1': len(re.findall(r'^# ', text, re.M)) == 1,
    'no_mojibake': not any(marker in text for marker in ('锛', '銆', '鈥', '馃')),
    'balanced_fences': text.count('```') % 2 == 0,
    'no_empty_images': not re.search(r'!\[[^]]*\]\(\s*\)', text),
}
print(checks)
sys.exit(0 if all(checks.values()) else 1)
'@ | python -
```

Expected: every check prints `True`.

### Task 3: Review and Commit the README

**Files:**
- Modify: `README.md` only if review identifies a factual or formatting issue.

- [ ] **Step 1: Inspect the rendered content structure from source**

Run:

```powershell
rg -n '^#{1,3} ' README.md
git diff -- README.md
```

Expected: the page flows from project identity to capabilities, preview, stack, startup, structure, quality, deeper docs, limitations, and license; the diff removes the endpoint manual without unrelated file changes.

- [ ] **Step 2: Run repository documentation and test smoke checks**

Run:

```powershell
python -m pytest tests/test_codex_workflow_pdf.py -q
cd frontend
pnpm typecheck
```

Expected: the PDF documentation test passes and Vue TypeScript checking exits with code 0. The README-only edit does not require rerunning all 529 frontend/backend tests unless another file changed.

- [ ] **Step 3: Commit the rewritten README**

Run:

```powershell
git add README.md
git commit -m "docs: rewrite README for project visitors"
```

Expected: one documentation commit containing only `README.md`.

- [ ] **Step 4: Confirm repository state**

Run:

```powershell
git status --short --branch
git log -2 --oneline --decorate
```

Expected: the current branch is clean and contains the README commit after the design/plan commits.

