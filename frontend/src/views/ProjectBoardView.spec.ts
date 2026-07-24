/* eslint-disable vue/one-component-per-file */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick, reactive, watch } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Project, ProjectMember } from '@/types/project'
import type { Task, TaskFilters, TaskPayload } from '@/types/task'

import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useBoardStore } from '@/stores/board'

import ProjectBoardView from './ProjectBoardView.vue'

const route = reactive({ params: { id: '9' as string | string[] } })
const push = vi.fn()
const replace = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push, replace }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessageBox: { confirm: vi.fn() },
  }
})

const project: Project = {
  id: 9,
  name: '发布工作流',
  description: '团队看板',
  owner_id: 7,
  invite_code: 'ABC123',
  created_at: '2026-07-24T08:00:00Z',
}

const members: ProjectMember[] = [{
  user_id: 7,
  username: 'alice',
  email: 'alice@example.com',
  role: 'owner',
}]

const tasks: Task[] = [
  { id: 1, project_id: 9, title: '待办任务', description: null, status: 'todo', priority: 'high', assignee_id: 7, sort_order: 1, comment_count: 0, created_at: '2026-07-24T08:00:00Z' },
  { id: 2, project_id: 9, title: '进行任务', description: null, status: 'in_progress', priority: 'medium', assignee_id: null, sort_order: 1, comment_count: 1, created_at: '2026-07-24T08:00:00Z' },
  { id: 3, project_id: 9, title: '完成任务', description: null, status: 'done', priority: 'low', assignee_id: 7, sort_order: 1, comment_count: 0, created_at: '2026-07-24T08:00:00Z' },
]

const payload: TaskPayload = {
  title: '新增任务',
  description: null,
  status: 'todo',
  priority: 'medium',
  assignee_id: null,
}

const dialogSubmittingHistory: boolean[] = []

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

const BoardToolbarStub = defineComponent({
  name: 'BoardToolbar',
  props: {
    priority: { type: String, required: true },
    assigneeId: { type: Number, required: true },
    members: { type: Array, required: true },
    disabled: Boolean,
    filtersActive: Boolean,
  },
  emits: ['update:priority', 'update:assigneeId', 'clear', 'create'],
  template: '<div data-testid="toolbar"><button data-testid="toolbar-create" @click="$emit(\'create\')">create</button></div>',
})

const KanbanColumnStub = defineComponent({
  name: 'KanbanColumn',
  props: {
    status: { type: String, required: true },
    tasks: { type: Array, required: true },
    disabled: Boolean,
    busy: Boolean,
  },
  emits: ['move'],
  template: `
    <section data-testid="kanban-column" :data-status="status">
      <slot v-for="task in tasks" name="task" :task="task" />
      <button data-testid="emit-move" @click="$emit('move', { taskId: 1, from: 'todo', to: 'done', newIndex: 0 })">move</button>
    </section>
  `,
})

const TaskCardStub = defineComponent({
  name: 'TaskCard',
  props: {
    task: { type: Object, required: true },
    members: { type: Array, required: true },
    busy: Boolean,
  },
  emits: ['edit', 'delete'],
  template: `
    <article data-testid="task-card" :data-task-id="task.id">
      {{ task.title }}
      <button data-testid="edit-task" @click="$emit('edit', task)">edit</button>
      <button data-testid="delete-task" @click="$emit('delete', task)">delete</button>
    </article>
  `,
})

const TaskDialogStub = defineComponent({
  name: 'TaskDialog',
  props: {
    modelValue: Boolean,
    task: { type: Object, required: true },
    members: { type: Array, required: true },
    defaultStatus: { type: String, required: true },
    submitting: Boolean,
    error: { type: String, required: true },
  },
  emits: ['update:modelValue', 'submit'],
  setup: props => {
    watch(() => props.submitting, value => dialogSubmittingHistory.push(value), { immediate: true })
    return { submitPayload: payload }
  },
  template: `
    <section v-if="modelValue" data-testid="task-dialog" :data-submitting="String(submitting)">
      <span data-testid="dialog-task-id">{{ task?.id ?? 'create' }}</span>
      <p v-if="error" data-testid="dialog-error">{{ error }}</p>
      <button data-testid="dialog-submit" @click="$emit('submit', submitPayload)">submit</button>
      <button data-testid="dialog-close" @click="$emit('update:modelValue', false)">close</button>
    </section>
  `,
})

function mountView(options: { loaded?: boolean } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  const board = useBoardStore()
  auth.token = 'header.payload.signature'
  auth.user = { id: 7, username: 'alice', email: 'alice@example.com', created_at: '2026-07-24T08:00:00Z' }
  board.currentProjectId = 9
  board.project = options.loaded === false ? null : project
  board.members = options.loaded === false ? [] : members
  board.tasks = options.loaded === false ? [] : tasks
  board.loaded = options.loaded !== false
  const loadProject = vi.spyOn(board, 'loadProject').mockResolvedValue()
  const reset = vi.spyOn(board, 'reset')
  const wrapper = mount(ProjectBoardView, {
    global: {
      plugins: [pinia],
      stubs: {
        BoardToolbar: BoardToolbarStub,
        KanbanColumn: KanbanColumnStub,
        TaskCard: TaskCardStub,
        TaskDialog: TaskDialogStub,
        'el-button': { template: '<button><slot /></button>' },
      },
    },
  })
  return { auth, board, loadProject, reset, wrapper }
}

describe('ProjectBoardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dialogSubmittingHistory.length = 0
    route.params.id = '9'
    push.mockResolvedValue(undefined)
    replace.mockResolvedValue(undefined)
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
  })

  it('contains absolute accessibility text inside each locally scrolling Kanban column', () => {
    const globalStyles = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')
    const boardSource = readFileSync(resolve(process.cwd(), 'src/views/ProjectBoardView.vue'), 'utf8')
    const columnSource = readFileSync(resolve(process.cwd(), 'src/components/board/KanbanColumn.vue'), 'utf8')

    expect(globalStyles).toMatch(/body\s*\{[^}]*overflow-x:\s*clip/s)
    expect(columnSource).toMatch(/\.kanban-column\s*\{[^}]*position:\s*relative/s)
    expect(columnSource).toMatch(/\.sr-only\s*\{[^}]*position:\s*absolute/s)
    expect(boardSource).toMatch(
      /@media\s*\(max-width:\s*920px\)[\s\S]*?\.board-page__columns\s*\{[^}]*overflow-x:\s*auto/,
    )
  })

  it('loads a positive safe project id, reloads on parameter change, and resets on unmount', async () => {
    const { loadProject, reset, wrapper } = mountView()
    await flushPromises()
    expect(loadProject).toHaveBeenCalledWith(9)

    route.params.id = '12'
    await nextTick()
    expect(loadProject).toHaveBeenLastCalledWith(12)
    expect(reset).toHaveBeenCalled()

    wrapper.unmount()
    expect(reset).toHaveBeenCalledTimes(2)
  })

  it.each(['invalid', '0', '-1', '1.5', '9007199254740992'])('resets and renders missing for invalid id %s', async (id) => {
    route.params.id = id
    const { loadProject, reset, wrapper } = mountView()
    await flushPromises()

    expect(loadProject).not.toHaveBeenCalled()
    expect(reset).toHaveBeenCalled()
    expect(wrapper.get('[data-testid="board-missing"]')).toBeDefined()
  })

  it('renders initial loading, forbidden, missing, and generic failure states', async () => {
    const { board, wrapper } = mountView({ loaded: false })
    board.loading = true
    await nextTick()
    expect(wrapper.get('[data-testid="board-loading"]')).toBeDefined()

    board.loading = false
    board.errorKind = 'forbidden'
    await nextTick()
    expect(wrapper.get('[data-testid="board-forbidden"]')).toBeDefined()

    board.errorKind = 'not_found'
    await nextTick()
    expect(wrapper.get('[data-testid="board-missing"]')).toBeDefined()

    board.errorKind = 'load'
    await nextTick()
    expect(wrapper.get('[data-testid="board-load-error"]').text()).not.toContain('backend detail')
    expect(wrapper.get('[data-testid="board-retry"]')).toBeDefined()
  })

  it('retries the current valid project and renders the loaded three-column board', async () => {
    const { board, loadProject, wrapper } = mountView()
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe(project.name)
    expect(wrapper.findAll('[data-testid="kanban-column"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="task-card"]')).toHaveLength(3)

    board.loaded = false
    board.project = null
    board.errorKind = 'load'
    await nextTick()
    await wrapper.get('[data-testid="board-retry"]').trigger('click')
    expect(loadProject).toHaveBeenLastCalledWith(9)
  })

  it('applies toolbar filters and ignores an older failure after a newer success', async () => {
    const older = deferred<void>()
    const applyFilters = vi.fn<(filters?: TaskFilters) => Promise<void>>()
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce()
    const { board, wrapper } = mountView()
    board.applyFilters = applyFilters
    await flushPromises()
    const toolbar = wrapper.getComponent(BoardToolbarStub)

    toolbar.vm.$emit('update:priority', 'high')
    await nextTick()
    toolbar.vm.$emit('update:assigneeId', 7)
    await flushPromises()
    older.reject(new Error('old backend detail'))
    await flushPromises()

    expect(applyFilters).toHaveBeenNthCalledWith(1, { priority: 'high', assignee_id: undefined })
    expect(applyFilters).toHaveBeenNthCalledWith(2, { priority: 'high', assignee_id: 7 })
    expect(wrapper.find('[data-testid="filter-error"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('old backend detail')
  })

  it('drives a visible false-true-false submit cycle and closes after create succeeds', async () => {
    const request = deferred<Task>()
    const { board, wrapper } = mountView()
    vi.spyOn(board, 'createTask').mockReturnValue(request.promise)
    await flushPromises()
    await wrapper.get('[data-testid="toolbar-create"]').trigger('click')
    expect(wrapper.get('[data-testid="task-dialog"]').attributes('data-submitting')).toBe('false')

    await wrapper.get('[data-testid="dialog-submit"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="task-dialog"]').attributes('data-submitting')).toBe('true')
    request.resolve(tasks[0]!)
    await flushPromises()

    expect(board.createTask).toHaveBeenCalledWith(payload)
    expect(dialogSubmittingHistory).toEqual([false, true, false])
    expect(wrapper.find('[data-testid="task-dialog"]').exists()).toBe(false)
  })

  it.each([
    { outcome: 'success', settle: (request: ReturnType<typeof deferred<Task>>) => request.resolve(tasks[0]!) },
    { outcome: 'failure', settle: (request: ReturnType<typeof deferred<Task>>) => request.reject(new Error('old detail')) },
  ])('does not let an old submit $outcome close or pollute a new project dialog', async ({ settle }) => {
    const request = deferred<Task>()
    const { board, wrapper } = mountView()
    vi.spyOn(board, 'createTask').mockReturnValue(request.promise)
    await flushPromises()
    await wrapper.get('[data-testid="toolbar-create"]').trigger('click')
    await wrapper.get('[data-testid="dialog-submit"]').trigger('click')
    await nextTick()

    route.params.id = '12'
    await nextTick()
    board.currentProjectId = 12
    board.project = { ...project, id: 12, name: '项目 B' }
    board.tasks = []
    board.loaded = true
    await nextTick()
    await wrapper.get('[data-testid="toolbar-create"]').trigger('click')

    settle(request)
    await flushPromises()

    expect(wrapper.get('[data-testid="task-dialog"]').attributes('data-submitting')).toBe('false')
    expect(wrapper.find('[data-testid="dialog-error"]').exists()).toBe(false)
  })

  it('keeps edit dialog open with a fixed safe error when update fails', async () => {
    const { board, wrapper } = mountView()
    vi.spyOn(board, 'updateTask').mockRejectedValue(new Error('SQL internal detail'))
    await flushPromises()
    await wrapper.get('[data-task-id="1"] [data-testid="edit-task"]').trigger('click')
    expect(wrapper.get('[data-testid="dialog-task-id"]').text()).toBe('1')

    await wrapper.get('[data-testid="dialog-submit"]').trigger('click')
    await flushPromises()

    expect(board.updateTask).toHaveBeenCalledWith(1, payload)
    expect(wrapper.get('[data-testid="task-dialog"]').attributes('data-submitting')).toBe('false')
    expect(wrapper.get('[data-testid="dialog-error"]').text()).not.toContain('SQL internal detail')
  })

  it('confirms deletion, retains the card on failure, and never exposes backend detail', async () => {
    const { board, wrapper } = mountView()
    vi.spyOn(board, 'deleteTask').mockRejectedValue(new Error('foreign key comments detail'))
    await flushPromises()
    await wrapper.get('[data-task-id="1"] [data-testid="delete-task"]').trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalledOnce()
    expect(board.deleteTask).toHaveBeenCalledWith(1)
    expect(wrapper.find('[data-task-id="1"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="mutation-error"]').text()).not.toContain('foreign key comments detail')
  })

  it('silently handles delete confirmation cancellation', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    const { board, wrapper } = mountView()
    const deleteTask = vi.spyOn(board, 'deleteTask')
    await flushPromises()
    await wrapper.get('[data-task-id="1"] [data-testid="delete-task"]').trigger('click')
    await flushPromises()
    expect(deleteTask).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="mutation-error"]').exists()).toBe(false)
  })

  it('invalidates an old pending delete confirmation after switching projects', async () => {
    const confirmation = deferred<never>()
    vi.mocked(ElMessageBox.confirm).mockReturnValueOnce(confirmation.promise)
    const { board, wrapper } = mountView()
    const deleteTask = vi.spyOn(board, 'deleteTask')
    await flushPromises()

    await wrapper.get('[data-task-id="1"] [data-testid="delete-task"]').trigger('click')
    route.params.id = '12'
    await nextTick()
    board.currentProjectId = 12
    confirmation.resolve('confirm' as never)
    await flushPromises()

    expect(deleteTask).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="mutation-error"]').exists()).toBe(false)
  })

  it('does not let an old delete request failure pollute the next project', async () => {
    const deletion = deferred<void>()
    const { board, wrapper } = mountView()
    vi.spyOn(board, 'deleteTask').mockReturnValue(deletion.promise)
    await flushPromises()

    await wrapper.get('[data-task-id="1"] [data-testid="delete-task"]').trigger('click')
    await flushPromises()
    expect(board.deleteTask).toHaveBeenCalledWith(1)

    route.params.id = '12'
    await nextTick()
    board.currentProjectId = 12
    board.project = { ...project, id: 12, name: '项目 B' }
    board.loaded = true
    deletion.reject(new Error('old foreign key detail'))
    await flushPromises()

    expect(wrapper.find('[data-testid="mutation-error"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('old foreign key detail')
  })

  it('disables the toolbar and columns and marks cards busy while loading', async () => {
    const { board, wrapper } = mountView()
    board.loading = true
    await nextTick()

    expect(wrapper.getComponent(BoardToolbarStub).props('disabled')).toBe(true)
    expect(wrapper.getComponent(KanbanColumnStub).props()).toMatchObject({ disabled: true, busy: false })
    expect(wrapper.getComponent(TaskCardStub).props('busy')).toBe(true)
  })

  it('catches move rejection, shows ordering error, and forwards busy contracts', async () => {
    const { board, wrapper } = mountView()
    vi.spyOn(board, 'moveTask').mockRejectedValue(new Error('ordering backend detail'))
    board.orderingError = { status: 500, code: 'failed', message: 'ordering backend detail', details: [] }
    board.ordering = true
    await nextTick()

    const toolbar = wrapper.getComponent(BoardToolbarStub)
    expect(toolbar.props('disabled')).toBe(true)
    expect(wrapper.getComponent(KanbanColumnStub).props()).toMatchObject({ disabled: true, busy: true })
    expect(wrapper.getComponent(TaskCardStub).props('busy')).toBe(true)
    expect(wrapper.get('[data-testid="ordering-error"]').text()).not.toContain('ordering backend detail')

    await wrapper.get('[data-testid="emit-move"]').trigger('click')
    await flushPromises()
    expect(board.moveTask).toHaveBeenCalledOnce()
  })

  it('returns to dashboard and logs out through the auth store', async () => {
    const { auth, wrapper } = mountView()
    vi.spyOn(auth, 'logout').mockImplementation(async () => auth.clearSession())
    await flushPromises()

    await wrapper.get('[data-testid="back-dashboard"]').trigger('click')
    await wrapper.get('[data-testid="logout-button"]').trigger('click')
    await flushPromises()

    expect(push).toHaveBeenCalledWith('/dashboard')
    expect(auth.logout).toHaveBeenCalledOnce()
    expect(replace).toHaveBeenCalledWith('/login')
  })
})
