import { flushPromises, mount } from '@vue/test-utils'
import axios from 'axios'
import ElementPlus, { ElForm } from 'element-plus'
import type { FormItemRule, FormRules } from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthData } from '@/types/auth'

import { ApiProtocolError, toApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/auth'

import AuthForm from './AuthForm.vue'

const ElFormStub = defineComponent({
  name: 'ElForm',
  props: {
    model: { type: Object, required: true },
    rules: { type: Object, required: true },
    showMessage: { type: Boolean, default: true },
  },
  emits: ['submit', 'validate'],
  methods: {
    clearValidate() {},
    validate() {
      return Promise.resolve(true)
    },
  },
  template: '<form @submit.prevent="$emit(\'submit\', $event)"><slot /></form>',
})

const authData: AuthData = {
  token: 'header.payload.signature',
  user: {
    id: 7,
    username: 'alice',
    email: 'alice@example.com',
    created_at: '2026-07-24T08:00:00Z',
  },
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

function responseError(status: number, data: unknown) {
  return new axios.AxiosError(
    'Request failed',
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      config: { headers: new axios.AxiosHeaders() },
      data,
      headers: {},
      status,
      statusText: 'Error',
    },
  )
}

async function mountForm(redirect?: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: { template: '<div />' } },
      { path: '/dashboard', component: { template: '<div />' } },
      { path: '/projects/:id', component: { template: '<div />' } },
    ],
  })
  await router.push({ path: '/login', query: redirect ? { redirect } : {} })
  await router.isReady()

  const wrapper = mount(AuthForm, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router, ElementPlus],
      stubs: {
        ElForm: ElFormStub,
      },
    },
  })
  const validate = vi.spyOn(wrapper.findComponent(ElForm).vm, 'validate').mockResolvedValue(true)

  return { router, store: useAuthStore(pinia), validate, wrapper }
}

function rulesFor(
  wrapper: Awaited<ReturnType<typeof mountForm>>['wrapper'],
  field: string,
): FormItemRule[] {
  const rules = wrapper.findComponent(ElForm).props('rules') as FormRules
  const fieldRules = rules[field]
  return Array.isArray(fieldRules) ? fieldRules : fieldRules ? [fieldRules] : []
}

function authenticate(store: ReturnType<typeof useAuthStore>, data: AuthData = authData) {
  store.token = data.token
  store.user = data.user
  return data
}

async function setInput(wrapper: Awaited<ReturnType<typeof mountForm>>['wrapper'], name: string, value: string) {
  await wrapper.get(`input[name="${name}"]`).setValue(value)
}

async function submit(wrapper: Awaited<ReturnType<typeof mountForm>>['wrapper']) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('AuthForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('starts in login mode and exposes semantic mode buttons', async () => {
    const { wrapper } = await mountForm()
    const loginMode = wrapper.get('[data-testid="mode-login"]')
    const registerMode = wrapper.get('[data-testid="mode-register"]')

    expect(loginMode.attributes('aria-pressed')).toBe('true')
    expect(registerMode.attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('.auth-form__modes').attributes('role')).toBe('group')
    expect(wrapper.get('input[name="username_or_email"]').attributes('aria-label')).toBe('用户名或邮箱')
    expect(wrapper.get('input[name="password"]').attributes('type')).toBe('password')
    expect(wrapper.find('input[name="username"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('验证码')
    expect(wrapper.get('input[name="password"]').attributes('autocomplete')).toBe('current-password')
  })

  it('switches to register fields and clears fields irrelevant to each mode', async () => {
    const { wrapper } = await mountForm()
    await setInput(wrapper, 'username_or_email', 'alice@example.com')
    await setInput(wrapper, 'password', 'shared-secret')

    await wrapper.get('[data-testid="mode-register"]').trigger('click')

    expect(wrapper.get('[data-testid="mode-register"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('input[name="username_or_email"]').exists()).toBe(false)
    expect(wrapper.get('input[name="password"]').element).toHaveProperty('value', 'shared-secret')
    expect(wrapper.get('input[name="username"]').element).toHaveProperty('value', '')
    expect(wrapper.get('input[name="password"]').attributes('autocomplete')).toBe('new-password')

    await setInput(wrapper, 'username', 'alice')
    await setInput(wrapper, 'email', 'alice@example.com')
    await setInput(wrapper, 'confirmPassword', 'shared-secret')
    await wrapper.get('[data-testid="mode-login"]').trigger('click')
    await wrapper.get('[data-testid="mode-register"]').trigger('click')

    expect(wrapper.get('input[name="username"]').element).toHaveProperty('value', '')
    expect(wrapper.get('input[name="email"]').element).toHaveProperty('value', '')
    expect(wrapper.get('input[name="confirmPassword"]').element).toHaveProperty('value', '')
    expect(wrapper.get('input[name="password"]').element).toHaveProperty('value', 'shared-secret')
  })

  it('uses account-friendly input semantics', async () => {
    const { wrapper } = await mountForm()

    expect(wrapper.get('input[name="username_or_email"]').attributes('spellcheck')).toBe('false')

    await wrapper.get('[data-testid="mode-register"]').trigger('click')

    expect(wrapper.get('input[name="username"]').attributes('spellcheck')).toBe('false')
    expect(wrapper.get('input[name="email"]').attributes('type')).toBe('email')
    expect(wrapper.get('input[name="email"]').attributes('spellcheck')).toBe('false')
  })

  it('uses Element Plus validation, announces invalid submission, and focuses the first invalid field', async () => {
    const { store, validate, wrapper } = await mountForm()
    const login = vi.spyOn(store, 'login').mockResolvedValue(authData)
    validate.mockRejectedValueOnce({
      username_or_email: [{ message: '请输入用户名或邮箱' }],
      password: [{ message: '请输入密码' }],
    })

    await submit(wrapper)

    expect(login).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      const identityError = wrapper.get('#field-error-username_or_email')
      const identityInput = wrapper.get('input[name="username_or_email"]')
      expect(identityError.text()).toBe('请输入用户名或邮箱')
      expect(identityError.attributes('role')).toBe('alert')
      expect(identityError.attributes('aria-live')).toBe('polite')
      expect(wrapper.get('#field-error-password').text()).toBe('请输入密码')
      expect(wrapper.get('.auth-form__error').text()).toBe('请检查标记的表单字段。')
      expect(identityInput.attributes('aria-invalid')).toBe('true')
      expect(identityInput.attributes('aria-describedby')).toBe('field-error-username_or_email')
      expect(identityInput.attributes('aria-errormessage')).toBe('field-error-username_or_email')
      expect(document.activeElement).toBe(identityInput.element)
    })
  })

  it('tracks field-specific messages from the public form validate event', async () => {
    const { wrapper } = await mountForm()
    const formComponent = wrapper.findComponent(ElForm)

    formComponent.vm.$emit('validate', 'username_or_email', false, '用户名格式有误')
    await nextTick()

    expect(wrapper.get('#field-error-username_or_email').text()).toBe('用户名格式有误')
    expect(wrapper.get('input[name="username_or_email"]').attributes('aria-invalid')).toBe('true')

    formComponent.vm.$emit('validate', 'username_or_email', true, '')
    await nextTick()
    expect(wrapper.find('#field-error-username_or_email').exists()).toBe(false)
  })

  it('validates registration email and matching password confirmation', async () => {
    const { store, validate, wrapper } = await mountForm()
    const register = vi.spyOn(store, 'register').mockResolvedValue(authData)
    validate.mockRejectedValueOnce({
      email: [{ message: '请输入有效的邮箱地址' }],
      confirmPassword: [{ message: '两次输入的密码不一致' }],
    })
    await wrapper.get('[data-testid="mode-register"]').trigger('click')
    await setInput(wrapper, 'username', 'alice')
    await setInput(wrapper, 'email', 'not-an-email')
    await setInput(wrapper, 'password', 'secret1')
    await setInput(wrapper, 'confirmPassword', 'secret2')

    await submit(wrapper)

    expect(register).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('请输入有效的邮箱地址')
      expect(wrapper.text()).toContain('两次输入的密码不一致')
    })
  })

  it('publishes backend-aligned Element Plus rules and exercises confirmation validation', async () => {
    const { wrapper } = await mountForm()

    expect(rulesFor(wrapper, 'username_or_email')).toEqual(expect.arrayContaining([
      expect.objectContaining({ required: true, message: '请输入用户名或邮箱' }),
      expect.objectContaining({ min: 2, max: 255 }),
    ]))
    expect(rulesFor(wrapper, 'password')).toEqual(expect.arrayContaining([
      expect.objectContaining({ required: true, message: '请输入密码' }),
      expect.objectContaining({ min: 6, max: 50 }),
    ]))

    await wrapper.get('[data-testid="mode-register"]').trigger('click')
    expect(rulesFor(wrapper, 'username')).toEqual(expect.arrayContaining([
      expect.objectContaining({ min: 2, max: 20 }),
    ]))
    expect(rulesFor(wrapper, 'email')).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'email', message: '请输入有效的邮箱地址' }),
    ]))

    await setInput(wrapper, 'password', 'secret1')
    const confirmationRule = rulesFor(wrapper, 'confirmPassword').find(rule => rule.validator)
    const validator = confirmationRule?.validator as unknown as (
      rule: unknown,
      value: string,
      callback: (error?: Error) => void,
    ) => void
    const mismatch = vi.fn()
    validator({}, 'secret2', mismatch)
    expect(mismatch).toHaveBeenCalledWith(expect.objectContaining({ message: '两次输入的密码不一致' }))

    const match = vi.fn()
    validator({}, 'secret1', match)
    expect(match).toHaveBeenCalledWith()
  })

  it('submits the exact login payload and safely redirects on success', async () => {
    const { router, store, wrapper } = await mountForm('/projects/42?view=board#today')
    const login = vi.spyOn(store, 'login').mockImplementation(async () => authenticate(store))
    const replace = vi.spyOn(router, 'replace').mockResolvedValue()
    await setInput(wrapper, 'username_or_email', 'alice@example.com')
    await setInput(wrapper, 'password', 'secret1')

    await submit(wrapper)

    expect(login).toHaveBeenCalledExactlyOnceWith({
      username_or_email: 'alice@example.com',
      password: 'secret1',
    })
    expect(replace).toHaveBeenCalledExactlyOnceWith('/projects/42?view=board#today')
  })

  it('submits the exact register payload without confirmation', async () => {
    const { store, wrapper } = await mountForm()
    const register = vi.spyOn(store, 'register').mockImplementation(async () => authenticate(store))
    await wrapper.get('[data-testid="mode-register"]').trigger('click')
    await setInput(wrapper, 'username', 'alice')
    await setInput(wrapper, 'email', 'alice@example.com')
    await setInput(wrapper, 'password', 'secret1')
    await setInput(wrapper, 'confirmPassword', 'secret1')

    await submit(wrapper)

    expect(register).toHaveBeenCalledExactlyOnceWith({
      username: 'alice',
      email: 'alice@example.com',
      password: 'secret1',
    })
  })

  it('rejects an external redirect after successful authentication', async () => {
    const { router, store, wrapper } = await mountForm('https://evil.example/steal')
    vi.spyOn(store, 'login').mockImplementation(async () => authenticate(store))
    const replace = vi.spyOn(router, 'replace').mockResolvedValue()
    await setInput(wrapper, 'username_or_email', 'alice')
    await setInput(wrapper, 'password', 'secret1')

    await submit(wrapper)

    expect(replace).toHaveBeenCalledExactlyOnceWith('/dashboard')
  })

  it('does not redirect when a resolved auth result is no longer the active session', async () => {
    const { router, store, wrapper } = await mountForm('/projects/42')
    vi.spyOn(store, 'login').mockResolvedValue(authData)
    const replace = vi.spyOn(router, 'replace').mockResolvedValue()
    await setInput(wrapper, 'username_or_email', 'alice')
    await setInput(wrapper, 'password', 'secret1')

    await submit(wrapper)

    expect(store.isAuthenticated).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })

  it('guards repeated submissions and shows a disabled loading button while pending', async () => {
    const request = deferred<AuthData>()
    const { store, wrapper } = await mountForm()
    const login = vi.spyOn(store, 'login').mockReturnValue(request.promise)
    await setInput(wrapper, 'username_or_email', 'alice')
    await setInput(wrapper, 'password', 'secret1')

    const submitButton = wrapper.get('button[type="submit"]')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('form').trigger('submit')

    expect(login).toHaveBeenCalledOnce()
    expect(submitButton.attributes()).toHaveProperty('disabled')
    expect(submitButton.attributes('aria-busy')).toBe('true')

    request.resolve(authData)
    await flushPromises()
  })

  it('locks before deferred validation and rejects duplicate submits or mode changes', async () => {
    const validation = deferred<boolean>()
    const { store, validate, wrapper } = await mountForm()
    validate.mockReturnValue(validation.promise)
    const login = vi.spyOn(store, 'login').mockResolvedValue(authData)
    await setInput(wrapper, 'username_or_email', 'alice')
    await setInput(wrapper, 'password', 'secret1')

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    const registerMode = wrapper.get('[data-testid="mode-register"]')

    expect(validate).toHaveBeenCalledOnce()
    expect(registerMode.attributes()).toHaveProperty('disabled')
    expect(wrapper.get('input[name="username_or_email"]').attributes()).toHaveProperty('disabled')
    await registerMode.trigger('click')
    expect(wrapper.get('[data-testid="mode-login"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('input[name="username"]').exists()).toBe(false)

    validation.resolve(true)
    await flushPromises()
    expect(login).toHaveBeenCalledOnce()
  })

  it.each([
    [401, { code: 'unauthorized', message: 'Unauthorized' }, '用户名、邮箱或密码不正确。'],
    [409, { code: 'conflict', message: 'Conflict' }, '用户名或邮箱已存在。'],
    [422, { code: 'validation_error', message: '邮箱已被拒绝', details: [] }, '邮箱已被拒绝'],
    [422, { code: 'validation_error', message: '', details: ['邮箱格式不受支持'] }, '邮箱格式不受支持'],
    [422, { code: 'validation_error', message: '', details: [] }, '请检查输入内容后重试。'],
  ] as const)('shows a user-safe message for HTTP %s and keeps entered values', async (status, body, expected) => {
    const { store, wrapper } = await mountForm()
    vi.spyOn(store, 'login').mockRejectedValue(responseError(status, body))
    await setInput(wrapper, 'username_or_email', 'alice@example.com')
    await setInput(wrapper, 'password', 'secret1')

    await submit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe(expected)
    expect(wrapper.get('input[name="username_or_email"]').element).toHaveProperty('value', 'alice@example.com')
    expect(wrapper.get('input[name="password"]').element).toHaveProperty('value', 'secret1')
  })

  it('does not expose internal server messages', async () => {
    const { store, wrapper } = await mountForm()
    vi.spyOn(store, 'login').mockRejectedValue(responseError(500, {
      code: 'internal_error',
      message: 'SQL connection password=secret failed',
    }))
    await setInput(wrapper, 'username_or_email', 'alice')
    await setInput(wrapper, 'password', 'secret1')

    await submit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe('服务暂时不可用，请稍后重试。')
    expect(wrapper.text()).not.toContain('SQL connection')
  })

  it('does not expose messages from non-client HTTP failures', async () => {
    const { store, wrapper } = await mountForm()
    vi.spyOn(store, 'login').mockRejectedValue(responseError(302, {
      code: 'unexpected_redirect',
      message: 'Internal upstream location',
    }))
    await setInput(wrapper, 'username_or_email', 'alice')
    await setInput(wrapper, 'password', 'secret1')

    await submit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe('请求失败，请稍后重试。')
    expect(wrapper.text()).not.toContain('Internal upstream')
  })

  it('sanitizes and caps normalized client error messages', async () => {
    const unsafeMessage = `\u0000\u001F  ${'a'.repeat(150)}\u007Fhidden`
    const { store, wrapper } = await mountForm()
    vi.spyOn(store, 'login').mockRejectedValue(responseError(400, {
      code: 'bad_request',
      message: unsafeMessage,
    }))
    await setInput(wrapper, 'username_or_email', 'alice')
    await setInput(wrapper, 'password', 'secret1')

    await submit(wrapper)

    const alert = wrapper.get('[role="alert"]').text()
    expect(alert).toBe('a'.repeat(120))
    expect(Array.from(alert).every((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 0x1F && codePoint !== 0x7F
    })).toBe(true)
  })

  it('uses normalized unknown messages and a dedicated storage failure message', async () => {
    const { store, wrapper } = await mountForm()
    const login = vi.spyOn(store, 'login')
    await setInput(wrapper, 'username_or_email', 'alice')
    await setInput(wrapper, 'password', 'secret1')

    login.mockRejectedValueOnce(new Error('boom'))
    await submit(wrapper)
    const normalizedMessage = wrapper.get('[role="alert"]').text()
    expect(normalizedMessage).not.toBe('boom')
    expect(normalizedMessage.length).toBeGreaterThan(0)

    login.mockRejectedValueOnce(new Error('TOKEN_STORAGE_WRITE_FAILED'))
    await submit(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toBe('无法保存登录状态，请检查浏览器存储设置。')
  })

  it.each([
    ['network', new axios.AxiosError('Network Error', 'ERR_NETWORK')],
    ['protocol', new ApiProtocolError()],
  ])('shows the normalized %s failure message', async (_kind, error) => {
    const { store, wrapper } = await mountForm()
    vi.spyOn(store, 'login').mockRejectedValue(error)
    await setInput(wrapper, 'username_or_email', 'alice')
    await setInput(wrapper, 'password', 'secret1')

    await submit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe(toApiError(error).message)
  })

  it('clears the form-level error when switching modes', async () => {
    const { store, wrapper } = await mountForm()
    vi.spyOn(store, 'login').mockRejectedValue(responseError(401, {}))
    await setInput(wrapper, 'username_or_email', 'alice')
    await setInput(wrapper, 'password', 'secret1')
    await submit(wrapper)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    await wrapper.get('[data-testid="mode-register"]').trigger('click')

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
