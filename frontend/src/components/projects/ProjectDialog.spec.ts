import axios from 'axios'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Project } from '@/types/project'

import { useProjectsStore } from '@/stores/projects'

import ProjectDialog from './ProjectDialog.vue'

const createdProject: Project = {
  id: 41,
  name: 'Alpha 项目',
  description: '跨团队交付',
  owner_id: 7,
  invite_code: 'ALPHA41',
  created_at: '2026-07-24T08:00:00Z',
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
    `HTTP ${status}`,
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      status,
      statusText: 'Error',
      headers: {},
      config: { headers: {} } as never,
      data,
    },
  )
}

async function mountDialog(mode: 'create' | 'join' = 'create', modelValue = true) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useProjectsStore()
  const wrapper = mount(ProjectDialog, {
    attachTo: document.body,
    props: { mode, modelValue },
    global: { plugins: [pinia, ElementPlus] },
  })

  await flushPromises()

  return { store, wrapper }
}

async function setInput(wrapper: VueWrapper, name: string, value: string) {
  await wrapper.get(`[name="${name}"]`).setValue(value)
}

async function submit(wrapper: VueWrapper) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('ProjectDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the create fields and submits the exact create payload', async () => {
    const { store, wrapper } = await mountDialog('create')
    const create = vi.spyOn(store, 'create').mockResolvedValue(createdProject)

    await setInput(wrapper, 'name', 'Alpha 项目')
    await setInput(wrapper, 'description', '跨团队交付')
    await submit(wrapper)

    expect(create).toHaveBeenCalledExactlyOnceWith({
      name: 'Alpha 项目',
      description: '跨团队交付',
    })
    expect(wrapper.emitted('success')).toEqual([[41]])
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
  })

  it.each(['', '   ', '\n\t'])('normalizes an empty create description %j to null', async (description) => {
    const { store, wrapper } = await mountDialog('create')
    const create = vi.spyOn(store, 'create').mockResolvedValue(createdProject)

    await setInput(wrapper, 'name', 'Alpha')
    await setInput(wrapper, 'description', description)
    await submit(wrapper)

    expect(create).toHaveBeenCalledExactlyOnceWith({ name: 'Alpha', description: null })
  })

  it('has no UTF-16 maxlength and accepts exact create code-point boundaries as unchanged payload', async () => {
    const { store, wrapper } = await mountDialog('create')
    const create = vi.spyOn(store, 'create').mockResolvedValue(createdProject)

    const name = '😀'.repeat(100)
    const description = '🚀'.repeat(500)
    const nameInput = wrapper.get('input[name="name"]')
    const descriptionInput = wrapper.get('textarea[name="description"]')

    expect(nameInput.attributes()).not.toHaveProperty('maxlength')
    expect(descriptionInput.attributes()).not.toHaveProperty('maxlength')
    await setInput(wrapper, 'name', name)
    await setInput(wrapper, 'description', description)
    await submit(wrapper)

    expect(create).toHaveBeenCalledExactlyOnceWith({ name, description })
  })

  it('rejects create values over code-point limits and focuses the first invalid field', async () => {
    const { store, wrapper } = await mountDialog('create')
    const create = vi.spyOn(store, 'create').mockResolvedValue(createdProject)

    await submit(wrapper)

    const nameInput = wrapper.get('input[name="name"]')
    expect(create).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(nameInput.element)
    expect(wrapper.get('[data-testid="form-error"]').text()).toBe('请检查标记的表单字段。')
    expect(nameInput.attributes('aria-invalid')).toBe('true')
    expect(nameInput.attributes('aria-describedby')).toBe('project-field-error-name')

    await setInput(wrapper, 'name', '😀'.repeat(101))
    await submit(wrapper)
    expect(create).not.toHaveBeenCalled()
    expect(wrapper.get('#project-field-error-name').text()).toContain('100')

    await setInput(wrapper, 'name', 'Alpha')
    await setInput(wrapper, 'description', '界'.repeat(501))
    await submit(wrapper)
    expect(create).not.toHaveBeenCalled()
    expect(wrapper.get('#project-field-error-description').text()).toContain('500')
  })

  it('renders join fields and trims only the invite code edges in the exact payload', async () => {
    const { store, wrapper } = await mountDialog('join')
    const join = vi.spyOn(store, 'join').mockResolvedValue(73)

    await setInput(wrapper, 'projectId', '73')
    await setInput(wrapper, 'invite_code', '  邀请码A1  ')
    await submit(wrapper)

    expect(join).toHaveBeenCalledExactlyOnceWith({
      projectId: 73,
      invite_code: '邀请码A1',
    })
    expect(wrapper.emitted('success')).toEqual([[73]])
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
  })

  it('requires a positive integer project id and a 4..12 code-point invite code', async () => {
    const { store, wrapper } = await mountDialog('join')
    const join = vi.spyOn(store, 'join').mockResolvedValue(73)

    await setInput(wrapper, 'projectId', '1.5')
    await setInput(wrapper, 'invite_code', '码'.repeat(3))
    await submit(wrapper)
    expect(join).not.toHaveBeenCalled()
    expect(wrapper.get('#project-field-error-projectId').text()).toContain('安全整数')
    expect(wrapper.get('#project-field-error-invite_code').text()).toContain('4 到 12')

    await setInput(wrapper, 'projectId', '73')
    await setInput(wrapper, 'invite_code', '😀'.repeat(12))
    await submit(wrapper)
    expect(join).toHaveBeenCalledOnce()

    join.mockClear()
    await setInput(wrapper, 'invite_code', '😀'.repeat(13))
    await submit(wrapper)
    expect(join).not.toHaveBeenCalled()
  })

  it('accepts Number.MAX_SAFE_INTEGER as a project id', async () => {
    const { store, wrapper } = await mountDialog('join')
    const join = vi.spyOn(store, 'join').mockResolvedValue(Number.MAX_SAFE_INTEGER)
    await setInput(wrapper, 'invite_code', 'JOIN73')

    await setInput(wrapper, 'projectId', String(Number.MAX_SAFE_INTEGER))
    await submit(wrapper)
    expect(join).toHaveBeenCalledExactlyOnceWith({
      projectId: Number.MAX_SAFE_INTEGER,
      invite_code: 'JOIN73',
    })
  })

  it('rejects a project id above Number.MAX_SAFE_INTEGER and focuses it', async () => {
    const { store, wrapper } = await mountDialog('join')
    const join = vi.spyOn(store, 'join').mockResolvedValue(73)
    await setInput(wrapper, 'invite_code', 'JOIN73')
    const projectIdInput = wrapper.get('input[name="projectId"]')
    await setInput(wrapper, 'projectId', String(Number.MAX_SAFE_INTEGER + 1))
    await submit(wrapper)

    expect(join).not.toHaveBeenCalled()
    expect(wrapper.get('#project-field-error-projectId').text()).toContain('安全整数')
    expect(document.activeElement).toBe(projectIdInput.element)
  })

  it('syncs project id validation ARIA to the native spinbutton and clears it after correction', async () => {
    const { store, wrapper } = await mountDialog('join')
    const join = vi.spyOn(store, 'join').mockResolvedValue(73)
    await setInput(wrapper, 'projectId', '1.5')
    await setInput(wrapper, 'invite_code', 'JOIN73')

    await submit(wrapper)

    const spinbutton = wrapper.get('input[name="projectId"][role="spinbutton"]')
    expect(join).not.toHaveBeenCalled()
    expect(spinbutton.attributes('aria-invalid')).toBe('true')
    expect(spinbutton.attributes('aria-describedby')).toBe('project-field-error-projectId')
    expect(spinbutton.attributes('aria-errormessage')).toBe('project-field-error-projectId')
    expect(document.activeElement).toBe(spinbutton.element)

    await setInput(wrapper, 'projectId', '73')
    await submit(wrapper)

    expect(join).toHaveBeenCalledOnce()
    expect(spinbutton.attributes('aria-invalid')).toBeUndefined()
    expect(spinbutton.attributes('aria-describedby')).toBeUndefined()
    expect(spinbutton.attributes('aria-errormessage')).toBeUndefined()
  })

  it('clears stale data, validation, and errors when mode changes or the dialog reopens', async () => {
    const { store, wrapper } = await mountDialog('create')
    vi.spyOn(store, 'create').mockRejectedValue(responseError(409, {
      code: 'conflict',
      message: '项目名称已存在',
    }))

    await setInput(wrapper, 'name', 'Alpha')
    await setInput(wrapper, 'description', '保留吗')
    await submit(wrapper)
    expect(wrapper.get('[data-testid="form-error"]').text()).toBe('请求失败，请稍后重试。')

    await wrapper.setProps({ mode: 'join' })
    await flushPromises()
    expect(wrapper.find('[data-testid="form-error"]').exists()).toBe(false)
    expect(wrapper.get('input[name="projectId"]').element).toHaveProperty('value', '')
    expect(wrapper.get('input[name="invite_code"]').element).toHaveProperty('value', '')

    await setInput(wrapper, 'projectId', '73')
    await setInput(wrapper, 'invite_code', 'JOIN73')
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(wrapper.get('input[name="projectId"]').element).toHaveProperty('value', '')
    expect(wrapper.get('input[name="invite_code"]').element).toHaveProperty('value', '')
    expect(wrapper.find('[data-testid="form-error"]').exists()).toBe(false)
  })

  it('locks synchronously, disables fields and buttons, and calls the store only once', async () => {
    const request = deferred<Project>()
    const { store, wrapper } = await mountDialog('create')
    const create = vi.spyOn(store, 'create').mockReturnValue(request.promise)
    await setInput(wrapper, 'name', 'Alpha')

    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const submitButton = wrapper.get('button[type="submit"]')
    expect(create).toHaveBeenCalledOnce()
    expect(submitButton.attributes()).toHaveProperty('disabled')
    expect(submitButton.attributes('aria-busy')).toBe('true')
    expect(wrapper.get('input[name="name"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('textarea[name="description"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('[data-testid="dialog-cancel"]').attributes()).toHaveProperty('disabled')

    request.resolve(createdProject)
    await flushPromises()
  })

  it.each(['resolve', 'reject'] as const)('ignores a stale create %s after switching to join mode', async (outcome) => {
    const request = deferred<Project>()
    const { store, wrapper } = await mountDialog('create')
    vi.spyOn(store, 'create').mockReturnValue(request.promise)
    await setInput(wrapper, 'name', 'Old create')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    await wrapper.setProps({ mode: 'join' })
    await flushPromises()
    await setInput(wrapper, 'projectId', '73')
    await setInput(wrapper, 'invite_code', 'JOIN73')

    if (outcome === 'resolve') {
      request.resolve(createdProject)
    } else {
      request.reject(responseError(500, { message: 'old create failed' }))
    }
    await flushPromises()

    expect(wrapper.emitted('success')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('[data-testid="form-error"]').exists()).toBe(false)
    expect(wrapper.get('input[name="projectId"]').element).toHaveProperty('value', '73')
    expect(wrapper.get('input[name="invite_code"]').element).toHaveProperty('value', 'JOIN73')
  })

  it.each(['resolve', 'reject'] as const)('ignores a stale create %s after parent close and reopen', async (outcome) => {
    const request = deferred<Project>()
    const { store, wrapper } = await mountDialog('create')
    vi.spyOn(store, 'create').mockReturnValue(request.promise)
    await setInput(wrapper, 'name', 'Old create')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    await setInput(wrapper, 'name', 'Fresh create')

    if (outcome === 'resolve') {
      request.resolve(createdProject)
    } else {
      request.reject(responseError(500, { message: 'old create failed' }))
    }
    await flushPromises()

    expect(wrapper.emitted('success')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('[data-testid="form-error"]').exists()).toBe(false)
    expect(wrapper.get('input[name="name"]').element).toHaveProperty('value', 'Fresh create')
  })

  it('does not let an old finally unlock a newer submission', async () => {
    const oldCreate = deferred<Project>()
    const newJoin = deferred<number>()
    const { store, wrapper } = await mountDialog('create')
    vi.spyOn(store, 'create').mockReturnValue(oldCreate.promise)
    const join = vi.spyOn(store, 'join').mockReturnValue(newJoin.promise)
    await setInput(wrapper, 'name', 'Old create')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    await wrapper.setProps({ mode: 'join' })
    await flushPromises()
    await setInput(wrapper, 'projectId', '73')
    await setInput(wrapper, 'invite_code', 'JOIN73')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const submitButton = wrapper.get('button[type="submit"]')
    expect(join).toHaveBeenCalledOnce()
    expect(submitButton.attributes('aria-busy')).toBe('true')

    oldCreate.resolve(createdProject)
    await flushPromises()

    expect(submitButton.attributes()).toHaveProperty('disabled')
    expect(submitButton.attributes('aria-busy')).toBe('true')
    await wrapper.get('form').trigger('submit')
    expect(join).toHaveBeenCalledOnce()

    newJoin.resolve(73)
    await flushPromises()
  })

  it.each([
    [403, '项目 ID 或邀请码无效'],
    [404, '项目不存在'],
  ] as const)('shows the dedicated safe join message for HTTP %s and keeps input', async (status, expected) => {
    const { store, wrapper } = await mountDialog('join')
    vi.spyOn(store, 'join').mockRejectedValue(responseError(status, {
      code: 'http_error',
      message: 'internal membership detail',
    }))
    await setInput(wrapper, 'projectId', '73')
    await setInput(wrapper, 'invite_code', ' JOIN73 ')

    await submit(wrapper)

    expect(wrapper.get('[data-testid="form-error"]').text()).toBe(expected)
    expect(wrapper.text()).not.toContain('internal membership detail')
    expect(wrapper.get('input[name="projectId"]').element).toHaveProperty('value', '73')
    expect(wrapper.get('input[name="invite_code"]').element).toHaveProperty('value', ' JOIN73 ')
  })

  it('requires the trusted backend code for the dedicated join status messages', async () => {
    const { store, wrapper } = await mountDialog('join')
    vi.spyOn(store, 'join').mockRejectedValue(responseError(403, {
      code: 'unexpected_forbidden',
      message: 'SQL membership host=db.internal',
    }))
    await setInput(wrapper, 'projectId', '73')
    await setInput(wrapper, 'invite_code', 'JOIN73')

    await submit(wrapper)

    expect(wrapper.get('[data-testid="form-error"]').text()).toBe('请求失败，请稍后重试。')
    expect(wrapper.text()).not.toMatch(/SQL|db\.internal/)
  })

  it.each([
    [409, { code: 'http_error', message: 'duplicate key value violates unique constraint' }],
    [422, {
      code: 'validation_error',
      message: 'SQL validation failed on db.internal:5432',
      details: [{ msg: 'host=db.internal duplicate key' }],
    }],
    [403, { code: 'unexpected_forbidden', message: 'membership table secret' }],
  ] as const)('uses a fixed generic message for untrusted HTTP %s content', async (status, body) => {
    const { store, wrapper } = await mountDialog('create')
    vi.spyOn(store, 'create').mockRejectedValue(responseError(status, body))
    await setInput(wrapper, 'name', 'Alpha')

    await submit(wrapper)

    expect(wrapper.get('[data-testid="form-error"]').text()).toBe('请求失败，请稍后重试。')
    expect(wrapper.text()).not.toMatch(/duplicate key|SQL|db\.internal|membership table secret/)
  })

  it('uses fixed safe messages for network and server failures', async () => {
    const { store, wrapper } = await mountDialog('create')
    const create = vi.spyOn(store, 'create')
    await setInput(wrapper, 'name', 'Alpha')

    create.mockRejectedValueOnce(new axios.AxiosError('host db.internal unavailable', 'ERR_NETWORK'))
    await submit(wrapper)
    expect(wrapper.get('[data-testid="form-error"]').text()).toBe('无法连接服务器，请稍后重试。')
    expect(wrapper.text()).not.toContain('db.internal')

    create.mockRejectedValueOnce(responseError(500, {
      code: 'internal_error',
      message: 'SQL password=secret failed',
    }))
    await submit(wrapper)
    expect(wrapper.get('[data-testid="form-error"]').text()).toBe('服务暂时不可用，请稍后重试。')
    expect(wrapper.text()).not.toContain('SQL password')
  })
})
