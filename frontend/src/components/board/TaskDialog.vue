<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import type { ComponentPublicInstance } from 'vue'

import { computed, nextTick, reactive, ref, watch } from 'vue'

import type { ProjectMember } from '@/types/project'
import type { Task, TaskPayload, TaskPriority, TaskStatus } from '@/types/task'

interface TaskFormModel {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assignee_id: number | null
}

type RequiredField = 'title' | 'status' | 'priority'

const props = defineProps<{
  modelValue: boolean
  task: Task | null
  members: ProjectMember[]
  defaultStatus: TaskStatus
  submitting: boolean
  error: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: TaskPayload]
}>()

const formRef = ref<FormInstance>()
const formRootRef = ref<HTMLElement>()
const statusSelectRef = ref<ComponentPublicInstance>()
const prioritySelectRef = ref<ComponentPublicInstance>()
const form = reactive<TaskFormModel>({
  title: '',
  description: '',
  status: props.defaultStatus,
  priority: 'medium',
  assignee_id: null,
})
const fieldInvalid = reactive<Record<RequiredField, boolean>>({
  title: false,
  status: false,
  priority: false,
})
const validationMessages = reactive<Record<RequiredField, string>>({
  title: '',
  status: '',
  priority: '',
})
const dialogTitle = computed(() => props.task ? '编辑任务' : '新建任务')
const submitLabel = computed(() => props.task ? '保存任务' : '创建任务')
const statusOptions: Array<{ label: string; value: TaskStatus }> = [
  { label: '待办', value: 'todo' },
  { label: '进行中', value: 'in_progress' },
  { label: '已完成', value: 'done' },
]
const priorityOptions: Array<{ label: string; value: TaskPriority }> = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
]
let generation = 0
let submitLocked = false
let activeValidationGeneration: number | null = null
let lockedGeneration: number | null = null
const pendingSubmissionGenerations: number[] = []
let activeParentSubmissionGeneration: number | null = null

function codePointLength(value: string): number {
  return Array.from(value).length
}

function isStatus(value: unknown): value is TaskStatus {
  return value === 'todo' || value === 'in_progress' || value === 'done'
}

function isPriority(value: unknown): value is TaskPriority {
  return value === 'low' || value === 'medium' || value === 'high'
}

const rules: FormRules<TaskFormModel> = {
  title: [{
    validator: (_rule, value: string, callback) => {
      if (!value.trim()) callback(new Error('请输入任务标题'))
      else if (codePointLength(value) > 200) callback(new Error('任务标题不能超过 200 个字符'))
      else callback()
    },
    trigger: 'blur',
  }],
  status: [{
    validator: (_rule, value: TaskStatus, callback) => {
      if (!isStatus(value)) callback(new Error('请选择任务状态'))
      else callback()
    },
    trigger: 'change',
  }],
  priority: [{
    validator: (_rule, value: TaskPriority, callback) => {
      if (!isPriority(value)) callback(new Error('请选择任务优先级'))
      else callback()
    },
    trigger: 'change',
  }],
}

function clearValidation(): void {
  for (const field of Object.keys(fieldInvalid) as RequiredField[]) {
    fieldInvalid[field] = false
    validationMessages[field] = ''
  }
  void nextTick(() => formRef.value?.clearValidate())
}

function initialize(): void {
  generation += 1
  submitLocked = false
  lockedGeneration = null
  activeValidationGeneration = null
  if (props.task) {
    form.title = props.task.title
    form.description = props.task.description ?? ''
    form.status = props.task.status
    form.priority = props.task.priority
    form.assignee_id = props.task.assignee_id
  }
  else {
    form.title = ''
    form.description = ''
    form.status = props.defaultStatus
    form.priority = 'medium'
    form.assignee_id = null
  }
  clearValidation()
}

function unlockSubmission(currentGeneration: number): void {
  if (lockedGeneration !== currentGeneration) return
  submitLocked = false
  lockedGeneration = null
}

function finishValidation(currentGeneration: number): void {
  if (activeValidationGeneration === currentGeneration) activeValidationGeneration = null
}

function setError(field: RequiredField, message: string): void {
  fieldInvalid[field] = true
  validationMessages[field] = message
}

function validateValues(): boolean {
  clearValidation()
  if (!form.title.trim()) setError('title', '请输入任务标题')
  else if (codePointLength(form.title) > 200) setError('title', '任务标题不能超过 200 个字符')
  if (!isStatus(form.status)) setError('status', '请选择任务状态')
  if (!isPriority(form.priority)) setError('priority', '请选择任务优先级')
  return !Object.values(fieldInvalid).some(Boolean)
}

function handleValidate(prop: string, valid: boolean, message: string): void {
  if (activeValidationGeneration !== null && activeValidationGeneration !== generation) return
  if (!Object.hasOwn(fieldInvalid, prop)) return
  const field = prop as RequiredField
  fieldInvalid[field] = !valid
  validationMessages[field] = valid ? '' : message
  void nextTick(syncSelectAria)
}

function selectInput(component: ComponentPublicInstance | undefined): HTMLElement | null {
  const root = component?.$el
  return root instanceof HTMLElement ? root.querySelector('[role="combobox"]') : null
}

function applyAria(element: HTMLElement | null, field: RequiredField): void {
  if (!element) return
  if (fieldInvalid[field]) {
    element.setAttribute('aria-invalid', 'true')
    element.setAttribute('aria-describedby', `task-field-error-${field}`)
    element.setAttribute('aria-errormessage', `task-field-error-${field}`)
  }
  else {
    element.removeAttribute('aria-invalid')
    element.removeAttribute('aria-describedby')
    element.removeAttribute('aria-errormessage')
  }
}

function syncSelectAria(): void {
  applyAria(selectInput(statusSelectRef.value), 'status')
  applyAria(selectInput(prioritySelectRef.value), 'priority')
}

async function focusFirstInvalid(currentGeneration: number): Promise<void> {
  await nextTick()
  if (generation !== currentGeneration || !props.modelValue) return
  const first = (['title', 'status', 'priority'] as RequiredField[]).find(field => fieldInvalid[field])
  if (!first) return
  if (first === 'title') {
    formRootRef.value?.querySelector<HTMLInputElement>('input[name="title"]')?.focus()
  }
  else if (first === 'status') selectInput(statusSelectRef.value)?.focus()
  else selectInput(prioritySelectRef.value)?.focus()
}

function requestClose(): void {
  if (!props.submitting) emit('update:modelValue', false)
}

function handleModelValueUpdate(value: boolean): void {
  if (!value) requestClose()
}

function updateAssignee(value: unknown): void {
  form.assignee_id = Number.isSafeInteger(value)
    && (value as number) > 0
    && props.members.some(member => member.user_id === value)
    ? value as number
    : null
}

async function submit(): Promise<void> {
  if (props.submitting || submitLocked || !formRef.value) return
  submitLocked = true
  const currentGeneration = generation
  lockedGeneration = currentGeneration
  activeValidationGeneration = currentGeneration

  if (!validateValues()) {
    unlockSubmission(currentGeneration)
    finishValidation(currentGeneration)
    syncSelectAria()
    await focusFirstInvalid(currentGeneration)
    return
  }

  let valid = false
  try {
    valid = await formRef.value.validate()
  }
  catch {
    valid = false
  }

  if (generation !== currentGeneration || !props.modelValue) {
    finishValidation(currentGeneration)
    return
  }
  if (!valid || Object.values(fieldInvalid).some(Boolean)) {
    unlockSubmission(currentGeneration)
    finishValidation(currentGeneration)
    syncSelectAria()
    await focusFirstInvalid(currentGeneration)
    return
  }

  pendingSubmissionGenerations.push(currentGeneration)
  emit('submit', {
    title: form.title,
    description: form.description.trim() ? form.description : null,
    status: form.status,
    priority: form.priority,
    assignee_id: form.assignee_id,
  })
  finishValidation(currentGeneration)
}

watch(
  () => props.modelValue,
  (isOpen, wasOpen) => {
    if (isOpen && !wasOpen) initialize()
    else if (!isOpen && wasOpen) {
      generation += 1
      submitLocked = false
      lockedGeneration = null
      activeValidationGeneration = null
      clearValidation()
    }
  },
)

watch(
  () => [
    props.task?.id ?? null,
    props.task?.title ?? null,
    props.task?.description ?? null,
    props.task?.status ?? null,
    props.task?.priority ?? null,
    props.task?.assignee_id ?? null,
  ] as const,
  () => {
    if (props.modelValue) initialize()
    else clearValidation()
  },
)

watch(
  () => props.defaultStatus,
  () => {
    if (props.modelValue && props.task === null) initialize()
    else clearValidation()
  },
)

watch(
  () => props.submitting,
  (submitting, wasSubmitting) => {
    if (submitting === wasSubmitting) return

    if (!wasSubmitting && submitting) {
      if (activeParentSubmissionGeneration === null) {
        activeParentSubmissionGeneration = pendingSubmissionGenerations.shift() ?? null
      }
      return
    }

    if (wasSubmitting && !submitting) {
      const completedGeneration = activeParentSubmissionGeneration
      activeParentSubmissionGeneration = null
      if (
        completedGeneration !== null
        && completedGeneration === lockedGeneration
        && completedGeneration === generation
      ) {
        unlockSubmission(completedGeneration)
      }
    }
  },
)

watch(
  () => [fieldInvalid.status, fieldInvalid.priority, props.modelValue] as const,
  syncSelectAria,
  { flush: 'post' },
)

initialize()
</script>

<template>
  <el-dialog
    class="task-dialog-window"
    :model-value="modelValue"
    :title="dialogTitle"
    width="min(560px, calc(100vw - 24px))"
    :append-to-body="false"
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    @update:model-value="handleModelValueUpdate"
  >
    <section
      ref="formRootRef"
      class="task-dialog"
      :aria-label="dialogTitle"
      :aria-busy="submitting"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        :show-message="false"
        novalidate
        @validate="handleValidate"
        @submit.prevent="submit"
      >
        <el-form-item
          label="任务标题"
          prop="title"
        >
          <el-input
            v-model="form.title"
            name="title"
            aria-label="任务标题"
            autocomplete="off"
            :disabled="submitting"
            :aria-invalid="fieldInvalid.title"
            :aria-describedby="fieldInvalid.title ? 'task-field-error-title' : undefined"
            :aria-errormessage="fieldInvalid.title ? 'task-field-error-title' : undefined"
          />
          <p
            v-if="fieldInvalid.title"
            id="task-field-error-title"
            class="task-dialog__field-error"
            role="alert"
          >
            {{ validationMessages.title }}
          </p>
        </el-form-item>

        <el-form-item
          label="任务描述（可选）"
          prop="description"
        >
          <el-input
            v-model="form.description"
            name="description"
            aria-label="任务描述"
            type="textarea"
            :rows="4"
            resize="vertical"
            :disabled="submitting"
          />
        </el-form-item>

        <div class="task-dialog__grid">
          <el-form-item
            label="状态"
            prop="status"
          >
            <el-select
              ref="statusSelectRef"
              v-model="form.status"
              aria-label="任务状态"
              :disabled="submitting"
            >
              <el-option
                v-for="option in statusOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <p
              v-if="fieldInvalid.status"
              id="task-field-error-status"
              class="task-dialog__field-error"
              role="alert"
            >
              {{ validationMessages.status }}
            </p>
          </el-form-item>

          <el-form-item
            label="优先级"
            prop="priority"
          >
            <el-select
              ref="prioritySelectRef"
              v-model="form.priority"
              aria-label="任务优先级"
              :disabled="submitting"
            >
              <el-option
                v-for="option in priorityOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <p
              v-if="fieldInvalid.priority"
              id="task-field-error-priority"
              class="task-dialog__field-error"
              role="alert"
            >
              {{ validationMessages.priority }}
            </p>
          </el-form-item>
        </div>

        <el-form-item
          label="负责人（可选）"
          prop="assignee_id"
        >
          <el-select
            :model-value="form.assignee_id"
            aria-label="任务负责人"
            placeholder="未分配"
            clearable
            :value-on-clear="null"
            :disabled="submitting"
            @update:model-value="updateAssignee"
          >
            <el-option
              v-for="member in members"
              :key="member.user_id"
              :label="member.username || member.email"
              :value="member.user_id"
            />
          </el-select>
        </el-form-item>

        <p
          v-if="error"
          class="task-dialog__error"
          data-testid="form-error"
          role="alert"
        >
          {{ error }}
        </p>

        <div class="task-dialog__actions">
          <el-button
            data-testid="dialog-cancel"
            native-type="button"
            :disabled="submitting"
            @click="requestClose"
          >
            取消
          </el-button>
          <el-button
            type="primary"
            native-type="submit"
            :disabled="submitting"
            :loading="submitting"
            :aria-busy="submitting"
          >
            {{ submitLabel }}
          </el-button>
        </div>
      </el-form>
    </section>
  </el-dialog>
</template>

<style scoped>
.task-dialog :deep(.el-form-item) {
  margin-bottom: 18px;
}

.task-dialog :deep(.el-select) {
  width: 100%;
}

.task-dialog__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.task-dialog__field-error,
.task-dialog__error {
  width: 100%;
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.task-dialog__field-error {
  margin: 4px 0 0;
}

.task-dialog__error {
  margin: 0 0 16px;
}

.task-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.task-dialog__actions :deep(.el-button) {
  min-width: 96px;
  margin: 0;
  white-space: nowrap;
}

@media (max-width: 520px) {
  .task-dialog__grid {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .task-dialog__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .task-dialog__actions :deep(.el-button) {
    width: 100%;
    min-width: 0;
  }
}
</style>
