<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue'

import type { ProjectMember } from '@/types/project'
import type { TaskPriority } from '@/types/task'

const props = defineProps<{
  priority: TaskPriority | undefined
  assigneeId: number | undefined
  members: ProjectMember[]
  disabled: boolean
  filtersActive: boolean
}>()

const emit = defineEmits<{
  'update:priority': [value: TaskPriority | undefined]
  'update:assigneeId': [value: number | undefined]
  clear: []
  create: []
}>()

const priorityOptions: Array<{ label: string; value: TaskPriority }> = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
]
const clearToUndefined = (): undefined => undefined

function memberLabel(member: ProjectMember): string {
  if (!member.username) return member.email
  return member.email ? `${member.username}（${member.email}）` : member.username
}

function updatePriority(value: unknown): void {
  const priority = value === 'low' || value === 'medium' || value === 'high'
    ? value
    : undefined
  emit('update:priority', priority)
}

function updateAssignee(value: unknown): void {
  const assigneeId = Number.isSafeInteger(value)
    && (value as number) > 0
    && props.members.some(member => member.user_id === value)
    ? value as number
    : undefined
  emit('update:assigneeId', assigneeId)
}
</script>

<template>
  <div
    class="board-toolbar"
    aria-label="看板工具栏"
  >
    <div class="board-toolbar__filters">
      <el-select
        class="board-toolbar__select"
        :model-value="priority"
        aria-label="优先级筛选"
        placeholder="全部优先级"
        clearable
        :value-on-clear="clearToUndefined"
        :disabled="disabled"
        @update:model-value="updatePriority"
      >
        <el-option
          v-for="option in priorityOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>

      <el-select
        class="board-toolbar__select"
        :model-value="assigneeId"
        aria-label="负责人筛选"
        placeholder="全部负责人"
        clearable
        :value-on-clear="clearToUndefined"
        :disabled="disabled"
        @update:model-value="updateAssignee"
      >
        <el-option
          v-for="member in members"
          :key="member.user_id"
          :label="memberLabel(member)"
          :value="member.user_id"
        />
      </el-select>
    </div>

    <p
      v-if="filtersActive"
      class="board-toolbar__notice"
      data-testid="filter-notice"
      role="status"
    >
      筛选启用时已暂停拖拽排序。
    </p>

    <div class="board-toolbar__commands">
      <el-button
        data-testid="clear-filters"
        :disabled="disabled || !filtersActive"
        @click="emit('clear')"
      >
        清除筛选
      </el-button>
      <el-button
        data-testid="create-task"
        type="primary"
        :icon="Plus"
        :disabled="disabled"
        @click="emit('create')"
      >
        新建任务
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.board-toolbar {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px 16px;
  flex-wrap: wrap;
}

.board-toolbar__filters,
.board-toolbar__commands {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.board-toolbar__select {
  width: 168px;
  min-width: 168px;
  max-width: 220px;
  flex: 0 1 220px;
}

.board-toolbar__notice {
  min-width: 220px;
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.board-toolbar__commands {
  margin-left: auto;
}

.board-toolbar__commands :deep(.el-button) {
  min-width: 96px;
  flex: 0 0 auto;
  margin: 0;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .board-toolbar__filters,
  .board-toolbar__commands {
    width: 100%;
  }

  .board-toolbar__select {
    width: min(100%, 220px);
    min-width: min(168px, 100%);
  }

  .board-toolbar__commands {
    margin-left: 0;
  }
}

@media (max-width: 420px) {
  .board-toolbar__select {
    width: 100%;
    min-width: 0;
    max-width: none;
    flex-basis: 100%;
  }
}
</style>
