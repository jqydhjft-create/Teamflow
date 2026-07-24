<script setup lang="ts">
import { ChatDotRound, Delete, Edit } from '@element-plus/icons-vue'
import { computed } from 'vue'

import type { ProjectMember } from '@/types/project'
import type { Task, TaskPriority } from '@/types/task'

const props = defineProps<{
  task: Task
  members: ProjectMember[]
  busy: boolean
}>()

const emit = defineEmits<{
  edit: [task: Task]
  delete: [task: Task]
}>()

const priorityLabels: Record<TaskPriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
}

const assigneeLabel = computed(() => {
  if (props.task.assignee_id === null) return '未分配'
  const member = props.members.find(member => member.user_id === props.task.assignee_id)
  return member?.username || member?.email || '未知成员'
})

function editTask(): void {
  if (!props.busy) emit('edit', props.task)
}

function deleteTask(): void {
  if (!props.busy) emit('delete', props.task)
}
</script>

<template>
  <article
    class="task-card"
    :aria-busy="busy"
  >
    <h3
      data-testid="task-title"
      class="task-card__title"
    >
      {{ task.title }}
    </h3>

    <div class="task-card__meta">
      <span
        data-testid="task-priority"
        class="task-card__priority"
      >
        <span
          data-testid="priority-swatch"
          class="task-card__swatch"
          :class="`task-card__swatch--${task.priority}`"
          aria-hidden="true"
        />
        {{ priorityLabels[task.priority] }}
      </span>
      <span class="task-card__assignee">{{ assigneeLabel }}</span>
      <span
        data-testid="comment-count"
        class="task-card__comments"
        :aria-label="`${task.comment_count} 条评论`"
      >
        <ChatDotRound
          class="task-card__comment-icon"
          aria-hidden="true"
        />
        {{ task.comment_count }}
      </span>
    </div>

    <div
      class="task-card__commands"
      @pointerdown.stop
      @mousedown.stop
      @touchstart.stop
    >
      <el-tooltip
        content="编辑任务"
        placement="top"
      >
        <el-button
          data-testid="edit-task"
          circle
          :icon="Edit"
          :disabled="busy"
          :aria-label="`编辑任务：${task.title}`"
          @click="editTask"
        />
      </el-tooltip>
      <el-tooltip
        content="删除任务"
        placement="top"
      >
        <el-button
          data-testid="delete-task"
          circle
          type="danger"
          plain
          :icon="Delete"
          :disabled="busy"
          :aria-label="`删除任务：${task.title}`"
          @click="deleteTask"
        />
      </el-tooltip>
    </div>
  </article>
</template>

<style scoped>
.task-card {
  position: relative;
  min-width: 0;
  padding: 12px 76px 12px 12px;
  border: 1px solid #d9dee7;
  border-radius: 6px;
  background: #fff;
  overflow-wrap: anywhere;
}

.task-card__title {
  display: -webkit-box;
  min-width: 0;
  margin: 0 0 10px;
  overflow: hidden;
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.task-card__meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px 12px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
  flex-wrap: wrap;
}

.task-card__priority,
.task-card__comments {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.task-card__comment-icon {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
}

.task-card__swatch {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 2px;
}

.task-card__swatch--low { background: #3b82f6; }
.task-card__swatch--medium { background: #d97706; }
.task-card__swatch--high { background: #dc2626; }

.task-card__assignee {
  min-width: 0;
  overflow-wrap: anywhere;
}

.task-card__commands {
  position: absolute;
  top: 9px;
  right: 9px;
  display: flex;
  width: 62px;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.task-card__commands :deep(.el-button) {
  min-width: 28px;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  margin: 0;
}
</style>
