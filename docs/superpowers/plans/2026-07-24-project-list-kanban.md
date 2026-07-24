# TeamFlow Project List and Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real authenticated project directory and three-column Kanban against the existing FastAPI project and task APIs.

**Architecture:** Keep HTTP decoding in domain API modules, business state and race control in setup-style Pinia stores, and rendering/interactions in focused Vue SFCs. Dashboard remains the project directory; `/project/:id` is a separate full-width board. SortableJS performs drag mechanics while the board store owns snapshots, batch payloads, submission locking, and rollback.

**Tech Stack:** Vue 3 Composition API with `<script setup lang="ts">`, Vue Router 4, Pinia 3, Axios, Element Plus selective registration, SortableJS, Vitest, Vue Test Utils, TypeScript.

**Repository constraint:** `D:\TeamFlow\.git` is invalid. Do not initialize, delete, repair, or replace it. Every task ends with a verification checkpoint instead of a Git commit.

---

## File Map

Create:

- `frontend/src/api/decoders.ts` - shared strict envelope and primitive decoders.
- `frontend/src/types/project.ts` - project/member payloads and models.
- `frontend/src/types/task.ts` - task/filter/order payloads and models.
- `frontend/src/api/projects.ts` and `projects.spec.ts` - project HTTP contract.
- `frontend/src/api/tasks.ts` and `tasks.spec.ts` - task HTTP contract.
- `frontend/src/stores/projects.ts` and `projects.spec.ts` - project directory state.
- `frontend/src/stores/board.ts` and `board.spec.ts` - project board state, CRUD, filtering, ordering and rollback.
- `frontend/src/components/projects/ProjectDialog.vue` and `.spec.ts` - create/join project forms.
- `frontend/src/components/projects/ProjectList.vue` and `.spec.ts` - project rows and empty/error states.
- `frontend/src/components/board/BoardToolbar.vue` and `.spec.ts` - filters and create command.
- `frontend/src/components/board/TaskDialog.vue` and `.spec.ts` - create/edit task form.
- `frontend/src/components/board/TaskCard.vue` and `.spec.ts` - compact task rendering/actions.
- `frontend/src/components/board/KanbanColumn.vue` and `.spec.ts` - SortableJS adapter for one status column.
- `frontend/src/views/ProjectBoardView.vue` and `.spec.ts` - route-level board orchestration.

Modify:

- `frontend/package.json` and `pnpm-lock.yaml` - SortableJS dependency.
- `frontend/src/api/auth.ts` - consume shared decoders without behavior change.
- `frontend/src/views/DashboardView.vue` and `.spec.ts` - real project directory.
- `frontend/src/router/index.ts` and `.spec.ts` - protected project route.
- `frontend/src/bootstrap.ts` and `main.spec.ts` - selectively register needed Element Plus components.
- `frontend/src/styles/main.css` - shared workspace tokens and stable control dimensions.
- `README.md` - frontend routes and delivered phase.

## Task 1: Shared Decoders and Domain Types

**Files:**

- Create: `frontend/src/api/decoders.ts`
- Create: `frontend/src/types/project.ts`
- Create: `frontend/src/types/task.ts`
- Modify: `frontend/src/api/auth.ts`
- Test: `frontend/src/api/auth.spec.ts`

- [ ] **Step 1: Add a failing auth API regression test for shared envelope behavior**

Add a test proving a finite numeric `code`, optional string `message`, and own `data` property are accepted, while inherited or missing `data` is rejected. Importing shared helpers must not loosen existing user/token validation.

```ts
it('rejects an envelope whose data exists only on the prototype', async () => {
  const body = Object.create({ data: authData }) as Record<string, unknown>
  body.code = 200
  vi.mocked(http.post).mockResolvedValue({ data: body })

  await expect(login(loginPayload)).rejects.toBeInstanceOf(ApiProtocolError)
})
```

- [ ] **Step 2: Run the regression test and confirm RED**

Run: `pnpm exec vitest run src/api/auth.spec.ts`

Expected: the new inherited-data test fails if the extraction does not require an own `data` field.

- [ ] **Step 3: Implement shared decoders and domain types**

`decoders.ts` exports:

```ts
export function isObject(value: unknown): value is Record<string, unknown>
export function decodePositiveInteger(value: unknown): number
export function decodeNonEmptyString(value: unknown): string
export function decodeNullableString(value: unknown): string | null
export function decodeEnvelope<T>(value: unknown, decodeData: (data: unknown) => T): T
```

All failures throw `ApiProtocolError`. Move the envelope/object primitives from `auth.ts` to this module and retain the same auth behavior.

Define exact project models:

```ts
export type ProjectRole = 'owner' | 'admin' | 'member'
export interface Project { id:number; name:string; description:string|null; owner_id:number; invite_code:string; created_at:string }
export interface ProjectListItem extends Project { role:ProjectRole }
export interface ProjectMember { user_id:number; username:string; email:string; role:ProjectRole }
export interface ProjectMembership { project_id:number; user_id:number; role:ProjectRole }
export interface CreateProjectPayload { name:string; description:string|null }
export interface JoinProjectPayload { projectId:number; invite_code:string }
```

Define exact task models:

```ts
export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'
export interface Task { id:number; project_id:number; title:string; description:string|null; status:TaskStatus; priority:TaskPriority; assignee_id:number|null; sort_order:number; comment_count:number; created_at:string }
export interface TaskPayload { title:string; description:string|null; status:TaskStatus; priority:TaskPriority; assignee_id:number|null }
export interface TaskFilters { priority?:TaskPriority; assignee_id?:number }
export interface TaskOrderItem { task_id:number; status:TaskStatus; sort_order:number }
```

- [ ] **Step 4: Run auth tests, typecheck, and lint**

Run:

```powershell
pnpm exec vitest run src/api/auth.spec.ts
pnpm typecheck
pnpm lint
```

Expected: all pass with no new warnings beyond the known Node engine warning.

- [ ] **Step 5: Record checkpoint**

Record changed files and commands in the parent task. Do not run Git commands.

## Task 2: Project and Task API Contracts

**Files:**

- Create: `frontend/src/api/projects.ts`
- Create: `frontend/src/api/projects.spec.ts`
- Create: `frontend/src/api/tasks.ts`
- Create: `frontend/src/api/tasks.spec.ts`

- [ ] **Step 1: Write failing project API tests**

Cover:

```ts
expect(listProjects()).resolves.toEqual([project])
expect(http.get).toHaveBeenCalledExactlyOnceWith('/api/projects')
expect(createProject(payload)).resolves.toEqual(projectWithoutRole)
expect(joinProject({ projectId: 9, invite_code: 'A1B2C3' })).resolves.toEqual({ project_id:9, user_id:7, role:'member' })
expect(getProject(9)).resolves.toEqual(projectWithoutRole)
expect(listProjectMembers(9)).resolves.toEqual([member])
```

Add malformed response cases for invalid IDs, role, missing `items`, non-array `items`, overlong/blank core strings, and non-string timestamps.

- [ ] **Step 2: Run project API tests and confirm RED**

Run: `pnpm exec vitest run src/api/projects.spec.ts`

Expected: module import fails because `projects.ts` does not exist.

- [ ] **Step 3: Implement `projects.ts`**

Export:

```ts
listProjects(): Promise<ProjectListItem[]>
createProject(payload: CreateProjectPayload): Promise<Project>
joinProject(payload: JoinProjectPayload): Promise<ProjectMembership>
getProject(projectId: number): Promise<Project>
listProjectMembers(projectId: number): Promise<ProjectMember[]>
```

Use existing `http`; build join URL from `projectId` and send only `{ invite_code }`. Decode every success envelope before returning.

- [ ] **Step 4: Write failing task API tests**

Cover list query parameter omission/inclusion, create, full update, delete, and batch ordering:

```ts
expect(http.get).toHaveBeenCalledWith('/api/projects/9/tasks', { params: { priority:'high', assignee_id:7 } })
expect(http.put).toHaveBeenCalledWith('/api/tasks/21', payload)
expect(http.patch).toHaveBeenCalledWith('/api/tasks/batch-order', { items })
```

Reject unknown statuses/priorities, non-integer ordering, negative comment count, missing fields, malformed `deleted`, and malformed `updated`.

- [ ] **Step 5: Run task API tests and confirm RED**

Run: `pnpm exec vitest run src/api/tasks.spec.ts`

Expected: module import fails because `tasks.ts` does not exist.

- [ ] **Step 6: Implement `tasks.ts`**

Export:

```ts
listTasks(projectId: number, filters?: TaskFilters): Promise<Task[]>
createTask(projectId: number, payload: TaskPayload): Promise<Task>
updateTask(taskId: number, payload: TaskPayload): Promise<Task>
deleteTask(taskId: number): Promise<void>
updateTaskOrder(items: TaskOrderItem[]): Promise<number>
```

Only include active filter properties in Axios `params`. Require delete response `data.deleted === true`; require batch response `updated` to be a non-negative integer.

- [ ] **Step 7: Verify API phase**

Run:

```powershell
pnpm exec vitest run src/api/projects.spec.ts src/api/tasks.spec.ts src/api/auth.spec.ts
pnpm typecheck
pnpm lint
```

Expected: all pass.

## Task 3: Project Directory Store

**Files:**

- Create: `frontend/src/stores/projects.ts`
- Create: `frontend/src/stores/projects.spec.ts`

- [ ] **Step 1: Write failing store tests**

Test initial state, successful load, load failure retaining previously confirmed data, create navigation data, join refresh, duplicate calls, and stale response protection.

Required stale-response test:

```ts
const oldRequest = deferred<ProjectListItem[]>()
vi.mocked(listProjects).mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce([newProject])
const store = useProjectsStore()
const oldLoad = store.loadProjects()
await store.loadProjects({ force: true })
oldRequest.resolve([oldProject])
await oldLoad
expect(store.projects).toEqual([newProject])
```

- [ ] **Step 2: Run store tests and confirm RED**

Run: `pnpm exec vitest run src/stores/projects.spec.ts`

Expected: module import fails.

- [ ] **Step 3: Implement setup-style project store**

State:

```ts
const projects = ref<ProjectListItem[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<ApiError | null>(null)
const submitting = ref(false)
```

Actions:

```ts
loadProjects(options?: { force?: boolean }): Promise<void>
create(payload: CreateProjectPayload): Promise<Project>
join(payload: JoinProjectPayload): Promise<number>
reset(): void
```

Use a monotonically increasing load ticket. `create` adds an owner-role item if the list is already loaded. `join` waits for a forced reload and returns the joined project ID. Do not clear confirmed projects on transient reload errors.

- [ ] **Step 4: Verify store phase**

Run:

```powershell
pnpm exec vitest run src/stores/projects.spec.ts
pnpm typecheck
pnpm lint
```

Expected: all pass.

## Task 4: Project Directory UI

**Files:**

- Create: `frontend/src/components/projects/ProjectDialog.vue`
- Create: `frontend/src/components/projects/ProjectDialog.spec.ts`
- Create: `frontend/src/components/projects/ProjectList.vue`
- Create: `frontend/src/components/projects/ProjectList.spec.ts`
- Modify: `frontend/src/views/DashboardView.vue`
- Modify: `frontend/src/views/DashboardView.spec.ts`

- [ ] **Step 1: Write failing `ProjectDialog` tests**

Test mode-specific fields, backend-aligned validation, duplicate submit lock, exact create/join payloads, preserved input on failure, and emitted success ID.

```ts
expect(create).toHaveBeenCalledWith({ name:'官网重构', description:'发布工作流' })
expect(join).toHaveBeenCalledWith({ projectId:12, invite_code:'A1B2C3' })
```

- [ ] **Step 2: Confirm dialog tests RED**

Run: `pnpm exec vitest run src/components/projects/ProjectDialog.spec.ts`

- [ ] **Step 3: Implement project dialog**

Use `ElDialog`, `ElForm`, `ElFormItem`, `ElInput`, `ElInputNumber`, and `ElButton`. Accept `mode: 'create' | 'join'`, `modelValue`, and emit `update:modelValue` plus `success(projectId)`. Display safe normalized errors; focus the first invalid field.

- [ ] **Step 4: Write failing list and Dashboard tests**

Test loading skeleton/text, empty state, error retry, role labels, project navigation, opening each dialog, and successful navigation.

```ts
expect(push).toHaveBeenCalledExactlyOnceWith('/project/12')
expect(wrapper.findAll('[data-testid="project-item"]')).toHaveLength(2)
```

- [ ] **Step 5: Confirm list/Dashboard tests RED**

Run: `pnpm exec vitest run src/components/projects/ProjectList.spec.ts src/views/DashboardView.spec.ts`

- [ ] **Step 6: Implement project directory**

`ProjectList` renders buttons or links with stable accessible names; never nest interactive elements. Dashboard calls `loadProjects()` on mount, owns dialog visibility, and navigates on success. Preserve the existing logout behavior and tests.

- [ ] **Step 7: Verify project directory phase**

Run:

```powershell
pnpm exec vitest run src/components/projects/ProjectDialog.spec.ts src/components/projects/ProjectList.spec.ts src/views/DashboardView.spec.ts
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all pass; bundle remains selectively imported.

## Task 5: Board Store Loading, Filtering, and CRUD

**Files:**

- Create: `frontend/src/stores/board.ts`
- Create: `frontend/src/stores/board.spec.ts`

- [ ] **Step 1: Write failing load/filter tests**

Test parallel project/member/task loading, project switch clearing, `403`/`404` page state, stale project response rejection, stale filter response rejection, grouping order, and `dragDisabled` when filters are active.

```ts
expect(store.columns.todo.map(task => task.id)).toEqual([2, 1])
expect(store.dragDisabled).toBe(true)
```

- [ ] **Step 2: Confirm load/filter tests RED**

Run: `pnpm exec vitest run src/stores/board.spec.ts`

- [ ] **Step 3: Implement board load/filter state**

State includes current project ID, project, members, tasks, filters, loading, error kind, task submission state, ordering state, and ordering error. `loadProject(id)` clears old domain state and uses a project ticket. `applyFilters()` uses a separate filter ticket.

Computed values:

```ts
columns: Record<TaskStatus, Task[]>
memberById: Map<number, ProjectMember>
filtersActive: boolean
dragDisabled: boolean
```

- [ ] **Step 4: Write failing CRUD tests**

Test create insertion, edit moving columns, delete only after success, delete failure retention, and duplicate mutation locking.

- [ ] **Step 5: Implement CRUD actions**

```ts
createTask(payload: TaskPayload): Promise<Task>
updateTask(taskId: number, payload: TaskPayload): Promise<Task>
deleteTask(taskId: number): Promise<void>
```

Replace task records by ID; always sort derived columns by `sort_order`, then `id`. Propagate normalized errors to the invoking form while retaining valid state.

- [ ] **Step 6: Verify board state phase**

Run:

```powershell
pnpm exec vitest run src/stores/board.spec.ts
pnpm typecheck
pnpm lint
```

Expected: all pass.

## Task 6: Sorting Transaction and SortableJS Adapter

**Files:**

- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`
- Modify: `frontend/src/stores/board.ts`
- Modify: `frontend/src/stores/board.spec.ts`
- Create: `frontend/src/components/board/KanbanColumn.vue`
- Create: `frontend/src/components/board/KanbanColumn.spec.ts`

- [ ] **Step 1: Install SortableJS**

Run:

```powershell
pnpm add sortablejs
pnpm add -D @types/sortablejs
```

Expected: package manifest and lockfile change only for these dependencies.

- [ ] **Step 2: Write failing order transaction tests**

Test column-local order, cross-column order, source/target full payload generation, one-based continuous ordering, lock behavior, no-op drag, filters-active rejection, and rollback.

Required rollback shape:

```ts
const before = structuredClone(store.tasks)
vi.mocked(updateTaskOrder).mockRejectedValue(new Error('offline'))
await expect(store.moveTask({ taskId:2, from:'todo', to:'in_progress', newIndex:0 })).rejects.toThrow()
expect(store.tasks).toEqual(before)
expect(store.orderingError).not.toBeNull()
```

- [ ] **Step 3: Confirm order tests RED**

Run: `pnpm exec vitest run src/stores/board.spec.ts`

- [ ] **Step 4: Implement `moveTask`**

Signature:

```ts
moveTask(input: { taskId:number; from:TaskStatus; to:TaskStatus; newIndex:number }): Promise<void>
```

Clone the pre-drag tasks, derive mutable source/target arrays, remove the task, insert at bounded `newIndex`, update affected records locally, and send all affected rows with continuous one-based ordering. Lock until the request settles; restore the full snapshot on failure.

- [ ] **Step 5: Write failing `KanbanColumn` tests**

Mock Sortable constructor. Assert it receives group configuration for cross-column movement, disabled state, animation, stable task ID attributes, `onEnd` event translation, and destroys the instance on unmount.

- [ ] **Step 6: Implement SortableJS adapter**

`KanbanColumn` accepts status, tasks, disabled and busy props, emits `move({taskId, from, to, newIndex})`, and reconfigures Sortable disabled state when props change. Do not put API calls in the component.

- [ ] **Step 7: Verify sorting phase**

Run:

```powershell
pnpm exec vitest run src/stores/board.spec.ts src/components/board/KanbanColumn.spec.ts
pnpm typecheck
pnpm lint
```

Expected: all pass.

## Task 7: Board Components and Task Dialog

**Files:**

- Create: `frontend/src/components/board/BoardToolbar.vue`
- Create: `frontend/src/components/board/BoardToolbar.spec.ts`
- Create: `frontend/src/components/board/TaskDialog.vue`
- Create: `frontend/src/components/board/TaskDialog.spec.ts`
- Create: `frontend/src/components/board/TaskCard.vue`
- Create: `frontend/src/components/board/TaskCard.spec.ts`

- [ ] **Step 1: Write failing toolbar tests**

Test exact priority/member values, clear command, create command, disabled state during loading, and the visible drag-disabled explanation when filters are active.

- [ ] **Step 2: Implement toolbar**

Use `ElSelect` and `ElOption` with controlled props/events. Use icon buttons only where the icon is familiar; keep “新建任务” as an icon plus text command.

- [ ] **Step 3: Write failing task dialog tests**

Test create/edit initialization, title limits, exact payload including `null` description/assignee, duplicate submission lock, retained input on failure, and no stale edit values after switching tasks.

- [ ] **Step 4: Implement task dialog**

Use one form for both modes. Props include `modelValue`, `task`, `members`, and `defaultStatus`; emit `submit(payload)` and `update:modelValue`. Parent controls the async operation and passes submitting/error state so the dialog remains presentational.

- [ ] **Step 5: Write failing task card tests**

Test title text, priority label, member lookup, unassigned label, comment count, edit/delete commands, text overflow structure, and no description rendering.

- [ ] **Step 6: Implement task card**

Use a compact article, priority swatch, assignee text, comment icon/count, and icon edit/delete buttons with tooltips and accessible names.

- [ ] **Step 7: Verify component phase**

Run:

```powershell
pnpm exec vitest run src/components/board/BoardToolbar.spec.ts src/components/board/TaskDialog.spec.ts src/components/board/TaskCard.spec.ts
pnpm typecheck
pnpm lint
```

Expected: all pass.

## Task 8: Project Board Route and Page Integration

**Files:**

- Create: `frontend/src/views/ProjectBoardView.vue`
- Create: `frontend/src/views/ProjectBoardView.spec.ts`
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/router/index.spec.ts`

- [ ] **Step 1: Write failing router tests**

Assert `/project/:id` exists, is lazy loaded, has `requiresAuth`, unauthenticated access preserves the full redirect, and invalid/non-positive IDs render the board route where the view can show not-found rather than bypassing auth.

- [ ] **Step 2: Confirm router tests RED**

Run: `pnpm exec vitest run src/router/index.spec.ts`

- [ ] **Step 3: Add protected route**

```ts
{
  path: '/project/:id',
  name: 'project-board',
  component: () => import('@/views/ProjectBoardView.vue'),
  meta: { requiresAuth: true },
}
```

- [ ] **Step 4: Write failing page tests**

Test project load on mount, reload on route ID change, stale board cleared, loading, forbidden, missing, retry, three columns, toolbar filters, create/edit/delete dialog flow, sort error, logout, and return-to-dashboard navigation.

- [ ] **Step 5: Implement `ProjectBoardView`**

Watch `() => route.params.id` with `{ immediate:true }`; parse a positive integer and otherwise set missing state. Compose the board store and child components. Keep page orchestration in the view and sorting math in the store.

- [ ] **Step 6: Verify route/page phase**

Run:

```powershell
pnpm exec vitest run src/router/index.spec.ts src/views/ProjectBoardView.spec.ts
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all pass.

## Task 9: Selective Element Plus Registration and Responsive Styling

**Files:**

- Modify: `frontend/src/bootstrap.ts`
- Modify: `frontend/src/main.spec.ts`
- Modify: `frontend/src/styles/main.css`
- Modify: project and board SFC scoped styles from Tasks 4, 7, and 8

- [ ] **Step 1: Write failing bootstrap registration test**

Extend the existing exact component registration order to include only the required components: `ElDialog`, `ElInputNumber`, `ElSelect`, `ElOption`, `ElTooltip`, and confirmation/message services only through direct imports actually used. Do not register all Element Plus.

- [ ] **Step 2: Confirm bootstrap test RED**

Run: `pnpm exec vitest run src/main.spec.ts`

- [ ] **Step 3: Register required components and CSS**

Import each component and its component CSS entry. Keep the existing auth components and storage listener behavior unchanged.

- [ ] **Step 4: Implement responsive constraints**

Required invariants:

- Desktop board: `grid-template-columns: repeat(3, minmax(280px, 1fr))`.
- Mobile board viewport: `overflow-x:auto` with fixed/minimum column width and no page-level horizontal overflow.
- Toolbar controls use stable min/max widths and wrap at narrow widths.
- Cards use `overflow-wrap:anywhere`; action buttons never overlap title or metadata.
- Dialog widths use `min()`/`calc()` constraints and fit 320px viewports.
- No nested page-section cards and no marketing hero layout.

- [ ] **Step 5: Verify styling/build phase**

Run:

```powershell
pnpm exec vitest run src/main.spec.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all frontend checks pass; inspect build output for accidental full Element Plus bundle growth.

## Task 10: Documentation, Final Review, and Real Browser QA

**Files:**

- Modify: `README.md`
- Modify only files required by findings from final review.

- [ ] **Step 1: Update README**

Document `/dashboard` and `/project/:id`, create/join requirements, task filters, drag-disabled-while-filtered behavior, SortableJS, and the existing task deletion/assignee/sort concurrency limitations.

- [ ] **Step 2: Run fresh complete verification**

Run in `frontend`:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run at repository root:

```powershell
python -m pytest tests -v
```

Expected: zero failures. Record exact file/test counts and bundle sizes.

- [ ] **Step 3: Dispatch whole-feature spec and quality reviews**

Give reviewers the approved design spec, this plan, current backend schemas/routes, and changed frontend files. Fix every accepted P1/P2 finding with a failing test first, then re-run the relevant phase checks.

- [ ] **Step 4: Execute real browser acceptance**

Use disposable QA users and the running FastAPI server to verify:

1. Create a project and enter its board.
2. Register/login a second user and join using project ID plus invite code.
3. Confirm owner/member roles in each project directory.
4. Create tasks in all statuses.
5. Edit title, priority, status, and assignee.
6. Filter by member and priority; confirm drag disabled.
7. Clear filters and perform column-local and cross-column drag.
8. Reload and confirm persisted order/status.
9. Delete a task with no comments.
10. Verify forbidden and missing project states.
11. Inspect console errors and failed requests.
12. Check desktop `1440x900` and mobile `390x844` for page overflow, clipping, overlap, and usable board scrolling.

- [ ] **Step 5: Finalize live page and report risks**

Keep one TeamFlow tab as the deliverable. Report modified files, verification evidence, Node 24 versus supported Node 22 caveat, invalid Git limitation, server-side logout limitation, task deletion foreign-key limitation, missing assignee membership enforcement, and last-writer-wins sorting.
