<script setup lang="ts">
import Sortable from 'sortablejs'
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

import type { Task, TaskStatus } from '@/types/task'

const props = defineProps<{
  status: TaskStatus
  tasks: Task[]
  disabled: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  move: [input: { taskId: number; from: TaskStatus; to: TaskStatus; newIndex: number }]
}>()

const statusLabels: Record<TaskStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
}

const listElement = ref<HTMLElement | null>(null)
const effectiveDisabled = computed(() => props.disabled || props.busy)
const keyboardDescriptionId = `kanban-keyboard-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
const statusOrder: TaskStatus[] = ['todo', 'in_progress', 'done']
let sortable: Sortable | null = null

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === 'todo' || value === 'in_progress' || value === 'done'
}

function validIndex(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function emitMove(input: { taskId: number; from: TaskStatus; to: TaskStatus; newIndex: number }): void {
  emit('move', input)
}

function restoreDraggedItem(event: Sortable.SortableEvent): void {
  const oldIndex = validIndex(event.oldDraggableIndex)
    ? event.oldDraggableIndex
    : validIndex(event.oldIndex)
      ? event.oldIndex
      : null

  if (oldIndex === null) return

  try {
    const { from, item } = event
    const siblings = Array.from(from.children).filter((child): child is HTMLElement => (
      child instanceof HTMLElement
      && child !== item
      && child.matches('[data-kanban-task]')
    ))
    const anchor = siblings[oldIndex]

    if (anchor) {
      from.insertBefore(item, anchor)
      return
    }

    const lastTask = siblings.at(-1)
    if (lastTask) {
      from.insertBefore(item, lastTask.nextSibling)
      return
    }

    const firstContent = Array.from(from.children).find(child => child !== item) ?? null
    from.insertBefore(item, firstContent)
  }
  catch {
    // Sortable events can contain stale DOM nodes; restoration is best effort.
  }
}

function handleEnd(event: Sortable.SortableEvent): void {
  restoreDraggedItem(event)

  const taskId = Number(event.item?.dataset.taskId)
  const from = event.from?.dataset.status
  const to = event.to?.dataset.status
  const newIndex = validIndex(event.newDraggableIndex)
    ? event.newDraggableIndex
    : event.newIndex

  if (
    !Number.isSafeInteger(taskId)
    || taskId <= 0
    || !isTaskStatus(from)
    || !isTaskStatus(to)
    || !validIndex(newIndex)
  ) {
    return
  }

  emitMove({ taskId, from, to, newIndex })
}

function handleTaskKeydown(event: KeyboardEvent, task: Task, index: number): void {
  if (event.target !== event.currentTarget) return
  if (effectiveDisabled.value || !event.altKey || event.ctrlKey || event.metaKey) return

  let move: { taskId: number; from: TaskStatus; to: TaskStatus; newIndex: number } | null = null
  if (event.key === 'ArrowUp' && index > 0) {
    move = { taskId: task.id, from: props.status, to: props.status, newIndex: index - 1 }
  }
  else if (event.key === 'ArrowDown' && index < props.tasks.length - 1) {
    move = { taskId: task.id, from: props.status, to: props.status, newIndex: index + 1 }
  }
  else if (event.key === 'ArrowLeft') {
    const statusIndex = statusOrder.indexOf(props.status)
    const target = statusOrder[statusIndex - 1]
    if (target) move = { taskId: task.id, from: props.status, to: target, newIndex: 0 }
  }
  else if (event.key === 'ArrowRight') {
    const statusIndex = statusOrder.indexOf(props.status)
    const target = statusOrder[statusIndex + 1]
    if (target) move = { taskId: task.id, from: props.status, to: target, newIndex: 0 }
  }

  if (!move) return

  event.preventDefault()
  emitMove(move)
}

onMounted(() => {
  if (!listElement.value) return

  sortable = new Sortable(listElement.value, {
    group: { name: 'teamflow-board', pull: true, put: true },
    animation: 150,
    disabled: effectiveDisabled.value,
    draggable: '[data-kanban-task]',
    onEnd: handleEnd,
  })
})

watch(effectiveDisabled, (disabled) => {
  sortable?.option('disabled', disabled)
})

onBeforeUnmount(() => {
  sortable?.destroy()
  sortable = null
})
</script>

<template>
  <section
    class="kanban-column"
    data-kanban-column
    :data-status="status"
    :aria-busy="busy"
  >
    <header class="kanban-column__header">
      <h2>{{ statusLabels[status] }}</h2>
      <span aria-label="任务数">{{ tasks.length }}</span>
    </header>

    <div
      ref="listElement"
      class="kanban-column__list"
      data-kanban-list
      role="list"
      :data-status="status"
      :aria-disabled="effectiveDisabled"
    >
      <div
        v-for="(task, index) in tasks"
        :key="task.id"
        class="kanban-column__task"
        data-kanban-task
        role="listitem"
        :tabindex="effectiveDisabled ? -1 : 0"
        :data-task-id="task.id"
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
        :aria-describedby="keyboardDescriptionId"
        @keydown="handleTaskKeydown($event, task, index)"
      >
        <slot
          name="task"
          :task="task"
        >
          <span>{{ task.title }}</span>
        </slot>
      </div>

      <p
        v-if="tasks.length === 0"
        class="kanban-column__empty"
        data-empty-state
      >
        暂无任务
      </p>
    </div>

    <p
      :id="keyboardDescriptionId"
      class="sr-only"
    >
      按住 Alt 键并使用方向键移动此任务。
    </p>
  </section>
</template>

<style scoped>
.kanban-column {
  position: relative;
  display: flex;
  min-width: 0;
  max-width: 100%;
  height: 100%;
  flex-direction: column;
}

.kanban-column__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 8px;
}

.kanban-column__header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
}

.kanban-column__header span {
  color: #64748b;
  font-size: 12px;
}

.kanban-column__list {
  display: flex;
  min-height: 96px;
  flex: 1;
  flex-direction: column;
  gap: 8px;
}

.kanban-column__task {
  min-width: 0;
  overflow-wrap: anywhere;
}

.kanban-column__empty {
  margin: 24px 0;
  color: #64748b;
  font-size: 13px;
  text-align: center;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
