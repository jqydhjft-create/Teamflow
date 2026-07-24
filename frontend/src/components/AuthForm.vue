<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'

import { computed, nextTick, reactive, ref, unref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { toApiError } from '@/api/errors'
import { resolveSafeRedirect } from '@/router'
import { useAuthStore } from '@/stores/auth'

type AuthMode = 'login' | 'register'

interface AuthFormModel {
  username_or_email: string
  username: string
  email: string
  password: string
  confirmPassword: string
}

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const formRef = ref<FormInstance>()
const formRootRef = ref<HTMLElement>()
const mode = ref<AuthMode>('login')
const submitting = ref(false)
const formError = ref('')
let modeGeneration = 0
const form = reactive<AuthFormModel>({
  username_or_email: '',
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
})
const fieldInvalid = reactive<Record<keyof AuthFormModel, boolean>>({
  username_or_email: false,
  username: false,
  email: false,
  password: false,
  confirmPassword: false,
})
const validationMessages = reactive<Record<keyof AuthFormModel, string>>({
  username_or_email: '',
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
})

const loginRules: FormRules<AuthFormModel> = {
  username_or_email: [
    { required: true, message: '请输入用户名或邮箱', trigger: 'blur' },
    { min: 2, max: 255, message: '用户名或邮箱长度应为 2 到 255 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 50, message: '密码长度应为 6 到 50 个字符', trigger: 'blur' },
  ],
}

const registerRules: FormRules<AuthFormModel> = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '用户名长度应为 2 到 20 个字符', trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' },
  ],
  password: loginRules.password,
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (value !== form.password) {
          callback(new Error('两次输入的密码不一致'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

const activeRules = computed(() => mode.value === 'login' ? loginRules : registerRules)
const submitLabel = computed(() => mode.value === 'login' ? '登录' : '注册')
const activeFields = computed<Array<keyof AuthFormModel>>(() => mode.value === 'login'
  ? ['username_or_email', 'password']
  : ['username', 'email', 'password', 'confirmPassword'])

function clearValidationState(): void {
  for (const key of Object.keys(fieldInvalid) as Array<keyof AuthFormModel>) {
    fieldInvalid[key] = false
    validationMessages[key] = ''
  }
}

function handleFieldValidation(prop: string, valid: boolean, message: string): void {
  if (Object.hasOwn(fieldInvalid, prop)) {
    const field = prop as keyof AuthFormModel
    fieldInvalid[field] = !valid
    validationMessages[field] = valid ? '' : message
  }
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

    const key = field as keyof AuthFormModel
    fieldInvalid[key] = true
    validationMessages[key] ||= unref(fieldContext.validateMessage)
  }
}

async function focusFirstInvalidField(): Promise<void> {
  await nextTick()
  const firstInvalid = activeFields.value.find(field => fieldInvalid[field])
  if (!firstInvalid) {
    return
  }

  const input = formRootRef.value?.querySelector<HTMLInputElement>(`input[name="${firstInvalid}"]:not(:disabled)`)
  input?.focus()
}

function safeBackendText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const cleaned = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1F || codePoint === 0x7F ? ' ' : character
  }).join('').trim()
  if (!cleaned) {
    return null
  }

  return cleaned.slice(0, 120)
}

function detailMessage(details: unknown[]): string | null {
  for (const detail of details) {
    const direct = safeBackendText(detail)
    if (direct) {
      return direct
    }

    if (typeof detail === 'object' && detail !== null) {
      const record = detail as Record<string, unknown>
      const nested = safeBackendText(record.message) ?? safeBackendText(record.msg)
      if (nested) {
        return nested
      }
    }
  }

  return null
}

function isTokenStorageFailure(error: unknown): boolean {
  return error instanceof Error && error.message === 'TOKEN_STORAGE_WRITE_FAILED'
}

function submissionErrorMessage(error: unknown): string {
  if (isTokenStorageFailure(error)) {
    return '无法保存登录状态，请检查浏览器存储设置。'
  }

  const apiError = toApiError(error)
  if (apiError.status === 401) {
    return '用户名、邮箱或密码不正确。'
  }
  if (apiError.status === 409) {
    return '用户名或邮箱已存在。'
  }
  if (apiError.status !== null && apiError.status >= 500) {
    return '服务暂时不可用，请稍后重试。'
  }
  if (apiError.status === 422) {
    const backendMessage = safeBackendText(apiError.message)
    return detailMessage(apiError.details)
      ?? (backendMessage === '请求失败，请稍后重试。' ? null : backendMessage)
      ?? '请检查输入内容后重试。'
  }
  if (apiError.status !== null && apiError.status < 400) {
    return '请求失败，请稍后重试。'
  }

  return safeBackendText(apiError.message) ?? '请求失败，请稍后重试。'
}

async function switchMode(nextMode: AuthMode): Promise<void> {
  if (submitting.value || mode.value === nextMode) {
    return
  }

  formError.value = ''
  clearValidationState()
  if (nextMode === 'register') {
    form.username_or_email = ''
  } else {
    form.username = ''
    form.email = ''
    form.confirmPassword = ''
  }
  mode.value = nextMode
  modeGeneration += 1
  await nextTick()
  formRef.value?.clearValidate()
}

async function submit(): Promise<void> {
  if (submitting.value || !formRef.value) {
    return
  }

  submitting.value = true
  const submissionMode = mode.value
  const submissionGeneration = modeGeneration
  let focusInvalid = false
  formError.value = ''
  clearValidationState()
  try {
    let valid = false
    try {
      valid = await formRef.value.validate()
    } catch (error) {
      applyValidationErrors(error)
      valid = false
    }

    if (submissionGeneration !== modeGeneration || submissionMode !== mode.value) {
      return
    }

    const hasInvalidField = activeFields.value.some(field => fieldInvalid[field])
    if (!valid || hasInvalidField) {
      formError.value = '请检查标记的表单字段。'
      focusInvalid = true
      return
    }

    const result = submissionMode === 'login'
      ? await auth.login({
        username_or_email: form.username_or_email,
        password: form.password,
      })
      : await auth.register({
        username: form.username,
        email: form.email,
        password: form.password,
      })

    if (submissionGeneration !== modeGeneration || submissionMode !== mode.value) {
      return
    }

    if (
      auth.isAuthenticated
      && auth.token === result.token
      && auth.user?.id === result.user.id
    ) {
      await router.replace(resolveSafeRedirect(route.query.redirect))
    }
  } catch (error) {
    formError.value = submissionErrorMessage(error)
  } finally {
    submitting.value = false
    if (focusInvalid) {
      await focusFirstInvalidField()
    }
  }
}
</script>

<template>
  <section
    ref="formRootRef"
    class="auth-form"
    aria-label="账户访问"
  >
    <div
      class="auth-form__modes"
      aria-label="账户操作模式"
      role="group"
    >
      <el-button
        data-testid="mode-login"
        native-type="button"
        :aria-pressed="mode === 'login'"
        :disabled="submitting"
        :type="mode === 'login' ? 'primary' : 'default'"
        @click="switchMode('login')"
      >
        登录
      </el-button>
      <el-button
        data-testid="mode-register"
        native-type="button"
        :aria-pressed="mode === 'register'"
        :disabled="submitting"
        :type="mode === 'register' ? 'primary' : 'default'"
        @click="switchMode('register')"
      >
        注册
      </el-button>
    </div>

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
      <el-form-item
        v-if="mode === 'login'"
        label="用户名或邮箱"
        prop="username_or_email"
      >
        <el-input
          v-model="form.username_or_email"
          name="username_or_email"
          aria-label="用户名或邮箱"
          autocomplete="username"
          :spellcheck="false"
          :aria-invalid="fieldInvalid.username_or_email"
          :aria-describedby="fieldInvalid.username_or_email ? 'field-error-username_or_email' : undefined"
          :aria-errormessage="fieldInvalid.username_or_email ? 'field-error-username_or_email' : undefined"
          :disabled="submitting"
        />
        <p
          v-if="fieldInvalid.username_or_email"
          id="field-error-username_or_email"
          class="auth-form__field-error"
          role="alert"
          aria-live="polite"
        >
          {{ validationMessages.username_or_email }}
        </p>
      </el-form-item>

      <template v-else>
        <el-form-item
          label="用户名"
          prop="username"
        >
          <el-input
            v-model="form.username"
            name="username"
            aria-label="用户名"
            autocomplete="username"
            :spellcheck="false"
            :aria-invalid="fieldInvalid.username"
            :aria-describedby="fieldInvalid.username ? 'field-error-username' : undefined"
            :aria-errormessage="fieldInvalid.username ? 'field-error-username' : undefined"
            :disabled="submitting"
          />
          <p
            v-if="fieldInvalid.username"
            id="field-error-username"
            class="auth-form__field-error"
            role="alert"
            aria-live="polite"
          >
            {{ validationMessages.username }}
          </p>
        </el-form-item>
        <el-form-item
          label="邮箱"
          prop="email"
        >
          <el-input
            v-model="form.email"
            name="email"
            type="email"
            aria-label="邮箱"
            autocomplete="email"
            :spellcheck="false"
            :aria-invalid="fieldInvalid.email"
            :aria-describedby="fieldInvalid.email ? 'field-error-email' : undefined"
            :aria-errormessage="fieldInvalid.email ? 'field-error-email' : undefined"
            :disabled="submitting"
          />
          <p
            v-if="fieldInvalid.email"
            id="field-error-email"
            class="auth-form__field-error"
            role="alert"
            aria-live="polite"
          >
            {{ validationMessages.email }}
          </p>
        </el-form-item>
      </template>

      <el-form-item
        label="密码"
        prop="password"
      >
        <el-input
          v-model="form.password"
          name="password"
          aria-label="密码"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          :aria-invalid="fieldInvalid.password"
          :aria-describedby="fieldInvalid.password ? 'field-error-password' : undefined"
          :aria-errormessage="fieldInvalid.password ? 'field-error-password' : undefined"
          show-password
          :disabled="submitting"
        />
        <p
          v-if="fieldInvalid.password"
          id="field-error-password"
          class="auth-form__field-error"
          role="alert"
          aria-live="polite"
        >
          {{ validationMessages.password }}
        </p>
      </el-form-item>

      <el-form-item
        v-if="mode === 'register'"
        label="确认密码"
        prop="confirmPassword"
      >
        <el-input
          v-model="form.confirmPassword"
          name="confirmPassword"
          aria-label="确认密码"
          type="password"
          autocomplete="new-password"
          :aria-invalid="fieldInvalid.confirmPassword"
          :aria-describedby="fieldInvalid.confirmPassword ? 'field-error-confirmPassword' : undefined"
          :aria-errormessage="fieldInvalid.confirmPassword ? 'field-error-confirmPassword' : undefined"
          show-password
          :disabled="submitting"
        />
        <p
          v-if="fieldInvalid.confirmPassword"
          id="field-error-confirmPassword"
          class="auth-form__field-error"
          role="alert"
          aria-live="polite"
        >
          {{ validationMessages.confirmPassword }}
        </p>
      </el-form-item>

      <p
        v-if="formError"
        class="auth-form__error"
        role="alert"
      >
        {{ formError }}
      </p>

      <el-button
        class="auth-form__submit"
        type="primary"
        native-type="submit"
        :disabled="submitting"
        :loading="submitting"
        :aria-busy="submitting"
      >
        {{ submitLabel }}
      </el-button>
    </el-form>
  </section>
</template>

<style scoped>
.auth-form {
  width: 100%;
}

.auth-form__modes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 24px;
}

.auth-form__modes :deep(.el-button) {
  width: 100%;
  margin: 0;
}

.auth-form__error {
  margin: 0 0 16px;
  color: var(--el-color-danger);
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.auth-form__field-error {
  width: 100%;
  margin: 4px 0 0;
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.auth-form__submit {
  width: 100%;
}
</style>
