<script setup lang="ts">
import { ArrowLeft, SwitchButton } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import 'element-plus/theme-chalk/el-message-box.css'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { Task, TaskFilters, TaskPayload, TaskPriority, TaskStatus } from '@/types/task'

import BoardToolbar from '@/components/board/BoardToolbar.vue'
import KanbanColumn from '@/components/board/KanbanColumn.vue'
import TaskCard from '@/components/board/TaskCard.vue'
import TaskDialog from '@/components/board/TaskDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useBoardStore } from '@/stores/board'
import '@/styles/main.css'

const SAFE_LOAD_MESSAGE = '无法加载项目，请稍后重试。'
const SAFE_FILTER_MESSAGE = '无法应用筛选，请重试。'
const SAFE_SAVE_MESSAGE = '无法保存任务，请重试。'
const SAFE_DELETE_MESSAGE = '无法删除任务，请重试。'
const SAFE_ORDER_MESSAGE = '无法保存任务顺序，已恢复原顺序。'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const board = useBoardStore()

const invalidRouteId = ref(false)
const priority = ref<TaskPriority>()
const assigneeId = ref<number>()
const filterError = ref('')
const mutationError = ref('')
const dialogOpen = ref(false)
const editingTask = ref<Task | null>(null)
const defaultStatus = ref<TaskStatus>('todo')
const dialogSubmitting = ref(false)
const dialogError = ref<string | null>(null)
const loggingOut = ref(false)
const navigationError = ref('')
let filterTicket = 0
let submitTicket = 0
let deleteTicket = 0

const statuses: TaskStatus[] = ['todo', 'in_progress', 'done']
const toolbarDisabled = computed(() => board.loading || board.taskSubmitting || board.ordering)
const cardBusy = computed(() => board.loading || board.taskSubmitting || board.ordering)
const currentUser = computed(() => auth.user?.username || auth.user?.email || '当前用户')

function parseProjectId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function currentProjectId(): number | null {
  return parseProjectId(route.params.id)
}

function closeDialog(): void {
  dialogOpen.value = false
  editingTask.value = null
  dialogError.value = null
}

function resetPageOperations(): void {
  filterTicket += 1
  submitTicket += 1
  deleteTicket += 1
  filterError.value = ''
  mutationError.value = ''
  dialogSubmitting.value = false
  closeDialog()
}

watch(
  () => route.params.id,
  (parameter) => {
    const id = parseProjectId(parameter)
    resetPageOperations()

    if (id === null) {
      invalidRouteId.value = true
      board.reset()
      return
    }

    invalidRouteId.value = false
    if (board.currentProjectId !== null && board.currentProjectId !== id) {
      board.reset()
    }
    priority.value = undefined
    assigneeId.value = undefined
    void board.loadProject(id)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  resetPageOperations()
  board.reset()
})

function retryLoad(): void {
  const id = currentProjectId()
  if (id !== null) void board.loadProject(id)
}

function requestFilters(): void {
  const ticket = ++filterTicket
  filterError.value = ''
  const filters: TaskFilters = {
    priority: priority.value,
    assignee_id: assigneeId.value,
  }
  void board.applyFilters(filters).catch(() => {
    if (ticket === filterTicket) filterError.value = SAFE_FILTER_MESSAGE
  })
}

function updatePriority(value: TaskPriority | undefined): void {
  priority.value = value
  requestFilters()
}

function updateAssignee(value: number | undefined): void {
  assigneeId.value = value
  requestFilters()
}

function clearFilters(): void {
  priority.value = undefined
  assigneeId.value = undefined
  requestFilters()
}

function openCreate(defaultTaskStatus: TaskStatus = 'todo'): void {
  mutationError.value = ''
  dialogError.value = null
  editingTask.value = null
  defaultStatus.value = defaultTaskStatus
  dialogOpen.value = true
}

function openEdit(task: Task): void {
  mutationError.value = ''
  dialogError.value = null
  editingTask.value = task
  defaultStatus.value = task.status
  dialogOpen.value = true
}

async function submitTask(payload: TaskPayload): Promise<void> {
  if (dialogSubmitting.value) return

  const ticket = ++submitTicket
  dialogError.value = null
  mutationError.value = ''
  dialogSubmitting.value = true
  await nextTick()

  let succeeded = false
  try {
    if (editingTask.value) await board.updateTask(editingTask.value.id, payload)
    else await board.createTask(payload)
    succeeded = true
  }
  catch {
    if (ticket === submitTicket) dialogError.value = SAFE_SAVE_MESSAGE
  }
  finally {
    if (ticket === submitTicket) {
      dialogSubmitting.value = false
      await nextTick()
      if (succeeded) closeDialog()
    }
  }
}

async function removeTask(task: Task): Promise<void> {
  const projectId = board.currentProjectId
  if (projectId === null || task.project_id !== projectId) return

  const ticket = ++deleteTicket
  const isCurrent = () => (
    ticket === deleteTicket
    && board.currentProjectId === projectId
    && task.project_id === projectId
  )
  mutationError.value = ''
  try {
    await ElMessageBox.confirm(
      `确定删除任务“${task.title}”吗？`,
      '删除任务',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  }
  catch {
    return
  }

  if (!isCurrent()) return

  try {
    await board.deleteTask(task.id)
  }
  catch {
    if (isCurrent()) mutationError.value = SAFE_DELETE_MESSAGE
  }
}

function moveTask(input: { taskId: number; from: TaskStatus; to: TaskStatus; newIndex: number }): void {
  void board.moveTask(input).catch(() => {
    // The store rolls back and exposes orderingError; consume rejection at the page boundary.
  })
}

async function backToDashboard(): Promise<void> {
  navigationError.value = ''
  try {
    await router.push('/dashboard')
  }
  catch {
    navigationError.value = '无法返回项目列表，请重试。'
  }
}

async function logout(): Promise<void> {
  if (loggingOut.value) return
  loggingOut.value = true
  navigationError.value = ''
  try {
    await auth.logout()
  }
  catch {
    // Local credentials are cleared by the store even if server logout fails.
  }

  try {
    await router.replace('/login')
  }
  catch {
    navigationError.value = '已退出登录，但页面跳转失败，请重试。'
  }
  finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <div class="board-page">
    <header class="board-page__header">
      <button
        class="board-page__back"
        data-testid="back-dashboard"
        type="button"
        aria-label="返回项目列表"
        @click="backToDashboard"
      >
        <ArrowLeft aria-hidden="true" />
        <span>项目列表</span>
      </button>

      <div class="board-page__account">
        <span>{{ currentUser }}</span>
        <button
          class="board-page__logout"
          data-testid="logout-button"
          type="button"
          :disabled="loggingOut"
          :aria-busy="loggingOut"
          @click="logout"
        >
          <SwitchButton aria-hidden="true" />
          <span>{{ loggingOut ? '正在退出' : '退出登录' }}</span>
        </button>
      </div>
    </header>

    <main class="board-page__main">
      <p
        v-if="navigationError"
        class="board-page__alert"
        role="alert"
      >
        {{ navigationError }}
      </p>

      <section
        v-if="invalidRouteId || board.errorKind === 'not_found'"
        class="board-page__state"
        data-testid="board-missing"
      >
        <h1>项目不存在</h1>
        <p>该项目地址无效，或项目已被删除。</p>
      </section>

      <section
        v-else-if="board.loading && !board.loaded"
        class="board-page__state"
        data-testid="board-loading"
        aria-live="polite"
      >
        <h1>正在加载看板</h1>
      </section>

      <section
        v-else-if="board.errorKind === 'forbidden'"
        class="board-page__state"
        data-testid="board-forbidden"
      >
        <h1>无权访问此项目</h1>
        <p>请返回项目列表选择你已加入的项目。</p>
      </section>

      <section
        v-else-if="board.errorKind === 'load'"
        class="board-page__state"
        data-testid="board-load-error"
      >
        <h1>看板加载失败</h1>
        <p>{{ SAFE_LOAD_MESSAGE }}</p>
        <button
          data-testid="board-retry"
          type="button"
          @click="retryLoad"
        >
          重试
        </button>
      </section>

      <section
        v-else-if="board.loaded && board.project"
        class="board-page__workspace"
      >
        <div class="board-page__heading">
          <div>
            <p class="board-page__eyebrow">
              项目看板
            </p>
            <h1>{{ board.project.name }}</h1>
            <p
              v-if="board.project.description"
              class="board-page__description"
            >
              {{ board.project.description }}
            </p>
          </div>
        </div>

        <BoardToolbar
          :priority="priority"
          :assignee-id="assigneeId"
          :members="board.members"
          :disabled="toolbarDisabled"
          :filters-active="board.filtersActive"
          @update:priority="updatePriority"
          @update:assignee-id="updateAssignee"
          @clear="clearFilters"
          @create="openCreate()"
        />

        <p
          v-if="filterError"
          data-testid="filter-error"
          class="board-page__alert"
          role="alert"
        >
          {{ filterError }}
        </p>
        <p
          v-if="mutationError"
          data-testid="mutation-error"
          class="board-page__alert"
          role="alert"
        >
          {{ mutationError }}
        </p>
        <p
          v-if="board.orderingError"
          data-testid="ordering-error"
          class="board-page__alert"
          role="alert"
        >
          {{ SAFE_ORDER_MESSAGE }}
        </p>

        <div class="board-page__columns">
          <KanbanColumn
            v-for="status in statuses"
            :key="status"
            :status="status"
            :tasks="board.columns[status]"
            :disabled="board.dragDisabled"
            :busy="board.ordering"
            @move="moveTask"
          >
            <template #task="{ task }">
              <TaskCard
                :task="task"
                :members="board.members"
                :busy="cardBusy"
                @edit="openEdit"
                @delete="removeTask"
              />
            </template>
          </KanbanColumn>
        </div>
      </section>
    </main>

    <TaskDialog
      v-model="dialogOpen"
      :task="editingTask"
      :members="board.members"
      :default-status="defaultStatus"
      :submitting="dialogSubmitting"
      :error="dialogError"
      @submit="submitTask"
    />
  </div>
</template>

<style scoped>
.board-page {
  min-width: 0;
  min-height: 100vh;
  overflow-x: clip;
  background: var(--tf-surface);
}

.board-page__header {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 10px clamp(18px, 4vw, 52px);
  border-bottom: 1px solid var(--tf-border);
  background: #fff;
}

.board-page__back,
.board-page__logout {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 7px 11px;
  border: 1px solid #c8cdca;
  border-radius: 6px;
  color: #353a3b;
  background: #fff;
  font: inherit;
  cursor: pointer;
}

.board-page__back svg,
.board-page__logout svg {
  width: 16px;
  height: 16px;
}

.board-page__account {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 16px;
  color: var(--tf-text-muted);
  font-size: 14px;
}

.board-page__account > span {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-page__main {
  width: min(100% - 36px, 1440px);
  min-width: 0;
  max-width: 100%;
  margin: 0 auto;
  padding: 30px 0 52px;
}

.board-page__state {
  padding: 72px 0;
  text-align: center;
}

.board-page__state h1,
.board-page__heading h1 {
  margin: 0;
  color: var(--tf-text);
  letter-spacing: 0;
}

.board-page__state h1 { font-size: 24px; }
.board-page__state p { color: var(--tf-text-muted); }

.board-page__state button {
  min-height: 36px;
  padding: 7px 16px;
  border: 1px solid #2f7770;
  border-radius: 6px;
  color: #fff;
  background: #2f7770;
  cursor: pointer;
}

.board-page__heading {
  margin-bottom: 22px;
}

.board-page__heading h1 { font-size: 27px; }
.board-page__eyebrow { margin: 0 0 6px; color: #347c74; font-size: 12px; font-weight: 700; }
.board-page__description { margin: 7px 0 0; color: var(--tf-text-muted); line-height: 1.5; overflow-wrap: anywhere; }

.board-page__alert {
  margin: 14px 0 0;
  color: #b84d3d;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.board-page__columns {
  display: grid;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  grid-template-columns: repeat(3, minmax(280px, 1fr));
  gap: 14px;
  margin-top: 22px;
}

.board-page__columns :deep(.kanban-column) {
  min-height: 360px;
  padding: 12px;
  border: 1px solid #d9dee7;
  border-radius: 6px;
  background: #f8faf9;
}

@media (max-width: 920px) {
  .board-page__columns {
    overflow-x: auto;
    grid-template-columns: repeat(3, minmax(280px, 320px));
    padding-bottom: 10px;
    overscroll-behavior-inline: contain;
    scrollbar-gutter: stable;
  }

  .board-page__columns :deep(.kanban-column) {
    width: 100%;
    min-width: 280px;
  }
}

@media (max-width: 560px) {
  .board-page__header { align-items: flex-start; padding: 12px 16px; }
  .board-page__account { align-items: flex-end; flex-direction: column; gap: 7px; }
  .board-page__account > span { max-width: 150px; }
  .board-page__main { width: min(100% - 28px, 1440px); padding-top: 24px; }
  .board-page__heading h1 { font-size: 24px; }
}
</style>
