<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import type { ComponentPublicInstance } from 'vue'

import { computed, nextTick, reactive, ref, unref, watch } from 'vue'

import { toApiError } from '@/api/errors'
import { useProjectsStore } from '@/stores/projects'

type ProjectDialogMode = 'create' | 'join'

interface ProjectFormModel {
  name: string
  description: string
  projectId: number | undefined
  invite_code: string
}

type ProjectFormField = keyof ProjectFormModel

const props = defineProps<{
  modelValue: boolean
  mode: ProjectDialogMode
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: [projectId: number]
}>()

const projectsStore = useProjectsStore()
const formRef = ref<FormInstance>()
const formRootRef = ref<HTMLElement>()
const projectIdInputNumberRef = ref<ComponentPublicInstance>()
const submitting = ref(false)
const formError = ref('')
let dialogGeneration = 0
let activeValidationGeneration: number | null = null
const form = reactive<ProjectFormModel>({
  name: '',
  description: '',
  projectId: undefined,
  invite_code: '',
})
const fieldInvalid = reactive<Record<ProjectFormField, boolean>>({
  name: false,
  description: false,
  projectId: false,
  invite_code: false,
})
const validationMessages = reactive<Record<ProjectFormField, string>>({
  name: '',
  description: '',
  projectId: '',
  invite_code: '',
})

const title = computed(() => props.mode === 'create' ? '新建项目' : '加入项目')
const submitLabel = computed(() => props.mode === 'create' ? '创建项目' : '加入项目')
const projectIdInputMax = Number.MAX_VALUE
const activeFields = computed<ProjectFormField[]>(() => props.mode === 'create'
  ? ['name', 'description']
  : ['projectId', 'invite_code'])

function codePointLength(value: string): number {
  return Array.from(value).length
}

const createRules: FormRules<ProjectFormModel> = {
  name: [{
    validator: (_rule, value: string, callback) => {
      if (!value.trim()) {
        callback(new Error('请输入项目名称'))
        return
      }
      if (codePointLength(value) > 100) {
        callback(new Error('项目名称不能超过 100 个字符'))
        return
      }
      callback()
    },
    trigger: 'blur',
  }],
  description: [{
    validator: (_rule, value: string, callback) => {
      if (codePointLength(value) > 500) {
        callback(new Error('项目描述不能超过 500 个字符'))
        return
      }
      callback()
    },
    trigger: 'blur',
  }],
}

const joinRules: FormRules<ProjectFormModel> = {
  projectId: [{
    validator: (_rule, value: number | undefined, callback) => {
      if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) {
        callback(new Error('项目 ID 必须是正的安全整数'))
        return
      }
      callback()
    },
    trigger: 'blur',
  }],
  invite_code: [{
    validator: (_rule, value: string, callback) => {
      const length = codePointLength(value.trim())
      if (length < 4 || length > 12) {
        callback(new Error('邀请码长度应为 4 到 12 个字符'))
        return
      }
      callback()
    },
    trigger: 'blur',
  }],
}

const activeRules = computed(() => props.mode === 'create' ? createRules : joinRules)

function clearValidationState(): void {
  for (const field of Object.keys(fieldInvalid) as ProjectFormField[]) {
    fieldInvalid[field] = false
    validationMessages[field] = ''
  }
}

function resetFormState(): void {
  form.name = ''
  form.description = ''
  form.projectId = undefined
  form.invite_code = ''
  formError.value = ''
  clearValidationState()
  void nextTick(() => formRef.value?.clearValidate())
}

function invalidateDialogGeneration(): void {
  dialogGeneration += 1
  submitting.value = false
}

function isCurrentSubmission(mode: ProjectDialogMode, generation: number): boolean {
  return props.modelValue && props.mode === mode && dialogGeneration === generation
}

function handleFieldValidation(prop: string, valid: boolean, message: string): void {
  if (
    activeValidationGeneration !== null
    && activeValidationGeneration !== dialogGeneration
  ) {
    return
  }
  if (!Object.hasOwn(fieldInvalid, prop)) {
    return
  }

  const field = prop as ProjectFormField
  fieldInvalid[field] = !valid
  validationMessages[field] = valid ? '' : message
}

function setFieldError(field: ProjectFormField, message: string): void {
  fieldInvalid[field] = true
  validationMessages[field] = message
}

function validateActiveValues(): boolean {
  if (props.mode === 'create') {
    if (!form.name.trim()) {
      setFieldError('name', '请输入项目名称')
    } else if (codePointLength(form.name) > 100) {
      setFieldError('name', '项目名称不能超过 100 个字符')
    }

    if (codePointLength(form.description) > 500) {
      setFieldError('description', '项目描述不能超过 500 个字符')
    }
  } else {
    if (!Number.isSafeInteger(form.projectId) || (form.projectId ?? 0) <= 0) {
      setFieldError('projectId', '项目 ID 必须是正的安全整数')
    }

    const inviteCodeLength = codePointLength(form.invite_code.trim())
    if (inviteCodeLength < 4 || inviteCodeLength > 12) {
      setFieldError('invite_code', '邀请码长度应为 4 到 12 个字符')
    }
  }

  return !activeFields.value.some(field => fieldInvalid[field])
}

function applyValidationErrors(value: unknown): void {
  if (typeof value === 'object' && value !== null) {
    const invalidFields = value as Record<string, Array<{ message?: unknown }>>
    for (const field of activeFields.value) {
      const message = invalidFields[field]?.[0]?.message
      if (typeof message === 'string' && message) {
        fieldInvalid[field] = true
        validationMessages[field] = message
      }
    }
  }

  if (!formRef.value || !Array.isArray(formRef.value.fields)) {
    return
  }

  for (const fieldContext of formRef.value.fields) {
    const field = unref(fieldContext.propString)
    if (!Object.hasOwn(fieldInvalid, field) || unref(fieldContext.validateState) !== 'error') {
      continue
    }

    const key = field as ProjectFormField
    fieldInvalid[key] = true
    validationMessages[key] ||= unref(fieldContext.validateMessage)
  }
}

async function focusFirstInvalidField(
  mode: ProjectDialogMode,
  generation: number,
): Promise<void> {
  await nextTick()
  if (!isCurrentSubmission(mode, generation)) {
    return
  }
  const firstInvalid = activeFields.value.find(field => fieldInvalid[field])
  if (!firstInvalid) {
    return
  }

  formRootRef.value
    ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${firstInvalid}"]:not(:disabled)`)
    ?.focus()
}

function syncProjectIdInputAria(): void {
  const root = projectIdInputNumberRef.value?.$el
  const input = root instanceof HTMLElement
    ? root.querySelector<HTMLInputElement>('input[name="projectId"]')
    : null
  if (!input) {
    return
  }

  if (fieldInvalid.projectId) {
    input.setAttribute('aria-invalid', 'true')
    input.setAttribute('aria-describedby', 'project-field-error-projectId')
    input.setAttribute('aria-errormessage', 'project-field-error-projectId')
    return
  }

  input.removeAttribute('aria-invalid')
  input.removeAttribute('aria-describedby')
  input.removeAttribute('aria-errormessage')
}

function submissionErrorMessage(error: unknown, mode: ProjectDialogMode): string {
  const apiError = toApiError(error)
  if (mode === 'join' && apiError.status === 403 && apiError.code === 'http_error') {
    return '项目 ID 或邀请码无效'
  }
  if (mode === 'join' && apiError.status === 404 && apiError.code === 'http_error') {
    return '项目不存在'
  }
  if (apiError.status !== null && apiError.status >= 500) {
    return '服务暂时不可用，请稍后重试。'
  }
  if (apiError.code === 'network_error') {
    return '无法连接服务器，请稍后重试。'
  }

  return '请求失败，请稍后重试。'
}

function requestClose(): void {
  if (!submitting.value) {
    emit('update:modelValue', false)
  }
}

function handleModelValueUpdate(value: boolean): void {
  if (!value) {
    requestClose()
  }
}

async function submit(): Promise<void> {
  if (submitting.value || !formRef.value) {
    return
  }

  submitting.value = true
  const submissionMode = props.mode
  const submissionGeneration = dialogGeneration
  activeValidationGeneration = submissionGeneration
  formError.value = ''
  clearValidationState()
  let focusInvalid = false

  try {
    if (!validateActiveValues()) {
      formError.value = '请检查标记的表单字段。'
      focusInvalid = true
      return
    }

    let valid = false
    try {
      valid = await formRef.value.validate()
    } catch (error) {
      if (!isCurrentSubmission(submissionMode, submissionGeneration)) {
        return
      }
      applyValidationErrors(error)
    }

    if (!isCurrentSubmission(submissionMode, submissionGeneration)) {
      return
    }

    const hasInvalidField = activeFields.value.some(field => fieldInvalid[field])
    if (!valid || hasInvalidField) {
      formError.value = '请检查标记的表单字段。'
      focusInvalid = true
      return
    }

    const projectId = submissionMode === 'create'
      ? (await projectsStore.create({
          name: form.name,
          description: form.description.trim() ? form.description : null,
        })).id
      : await projectsStore.join({
          projectId: form.projectId as number,
          invite_code: form.invite_code.trim(),
        })

    if (!isCurrentSubmission(submissionMode, submissionGeneration)) {
      return
    }

    emit('success', projectId)
    emit('update:modelValue', false)
  } catch (error) {
    if (isCurrentSubmission(submissionMode, submissionGeneration)) {
      formError.value = submissionErrorMessage(error, submissionMode)
    }
  } finally {
    if (isCurrentSubmission(submissionMode, submissionGeneration)) {
      submitting.value = false
      activeValidationGeneration = null
      if (focusInvalid) {
        await focusFirstInvalidField(submissionMode, submissionGeneration)
      }
    }
  }
}

watch(
  () => props.mode,
  () => {
    invalidateDialogGeneration()
    resetFormState()
  },
)

watch(
  () => props.modelValue,
  (isOpen, wasOpen) => {
    if (isOpen === wasOpen) {
      return
    }

    invalidateDialogGeneration()
    if (isOpen) {
      resetFormState()
    }
  },
)

watch(
  () => [fieldInvalid.projectId, props.mode, props.modelValue] as const,
  syncProjectIdInputAria,
  { flush: 'post', immediate: true },
)
</script>

<template>
  <el-dialog
    class="project-dialog-window"
    :model-value="modelValue"
    :title="title"
    width="min(520px, calc(100vw - 24px))"
    :append-to-body="false"
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    @update:model-value="handleModelValueUpdate"
  >
    <section
      ref="formRootRef"
      class="project-dialog"
      :aria-label="title"
      :aria-busy="submitting"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="activeRules"
        label-position="top"
        :show-message="false"
        novalidate
        @validate="handleFieldValidation"
        @submit.prevent="submit"
      >
        <template v-if="mode === 'create'">
          <el-form-item
            label="项目名称"
            prop="name"
          >
            <el-input
              v-model="form.name"
              name="name"
              aria-label="项目名称"
              autocomplete="off"
              :aria-invalid="fieldInvalid.name"
              :aria-describedby="fieldInvalid.name ? 'project-field-error-name' : undefined"
              :aria-errormessage="fieldInvalid.name ? 'project-field-error-name' : undefined"
              :disabled="submitting"
            />
            <p
              v-if="fieldInvalid.name"
              id="project-field-error-name"
              class="project-dialog__field-error"
              role="alert"
            >
              {{ validationMessages.name }}
            </p>
          </el-form-item>

          <el-form-item
            label="项目描述（可选）"
            prop="description"
          >
            <el-input
              v-model="form.description"
              name="description"
              aria-label="项目描述"
              type="textarea"
              :rows="4"
              resize="vertical"
              :aria-invalid="fieldInvalid.description"
              :aria-describedby="fieldInvalid.description ? 'project-field-error-description' : undefined"
              :aria-errormessage="fieldInvalid.description ? 'project-field-error-description' : undefined"
              :disabled="submitting"
            />
            <p
              v-if="fieldInvalid.description"
              id="project-field-error-description"
              class="project-dialog__field-error"
              role="alert"
            >
              {{ validationMessages.description }}
            </p>
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item
            label="项目 ID"
            prop="projectId"
          >
            <el-input-number
              ref="projectIdInputNumberRef"
              v-model="form.projectId"
              name="projectId"
              aria-label="项目 ID"
              :min="1"
              :max="projectIdInputMax"
              :step="1"
              :controls="false"
              :disabled="submitting"
            />
            <p
              v-if="fieldInvalid.projectId"
              id="project-field-error-projectId"
              class="project-dialog__field-error"
              role="alert"
            >
              {{ validationMessages.projectId }}
            </p>
          </el-form-item>

          <el-form-item
            label="邀请码"
            prop="invite_code"
          >
            <el-input
              v-model="form.invite_code"
              name="invite_code"
              aria-label="邀请码"
              autocomplete="off"
              :aria-invalid="fieldInvalid.invite_code"
              :aria-describedby="fieldInvalid.invite_code ? 'project-field-error-invite_code' : undefined"
              :aria-errormessage="fieldInvalid.invite_code ? 'project-field-error-invite_code' : undefined"
              :disabled="submitting"
            />
            <p
              v-if="fieldInvalid.invite_code"
              id="project-field-error-invite_code"
              class="project-dialog__field-error"
              role="alert"
            >
              {{ validationMessages.invite_code }}
            </p>
          </el-form-item>
        </template>

        <p
          v-if="formError"
          class="project-dialog__error"
          data-testid="form-error"
          role="alert"
        >
          {{ formError }}
        </p>

        <div class="project-dialog__actions">
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
.project-dialog :deep(.el-form-item) {
  margin-bottom: 20px;
}

.project-dialog :deep(.el-input-number) {
  width: 100%;
}

.project-dialog__field-error {
  width: 100%;
  margin: 4px 0 0;
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.project-dialog__error {
  margin: 0 0 16px;
  color: var(--el-color-danger);
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.project-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.project-dialog__actions :deep(.el-button) {
  min-width: 96px;
  margin: 0;
  white-space: nowrap;
}

@media (max-width: 520px) {
  .project-dialog__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .project-dialog__actions :deep(.el-button) {
    width: 100%;
    min-width: 0;
  }
}
</style>
