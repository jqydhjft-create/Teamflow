import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '@/types/auth'
import type { ProjectListItem } from '@/types/project'

import { useAuthStore } from '@/stores/auth'
import { useProjectsStore } from '@/stores/projects'

import DashboardView from './DashboardView.vue'

const push = vi.fn()
const replace = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace }),
}))

const ProjectDialogStub = defineComponent({
  props: {
    modelValue: { type: Boolean, required: true },
    mode: { type: String, required: true },
  },
  emits: ['update:modelValue', 'success'],
  template: `
    <section v-if="modelValue" :data-testid="\`dialog-\${mode}\`">
      <input :name="\`stub-\${mode}\`" value="保留的输入">
      <button type="button" :data-testid="\`dialog-success-\${mode}\`" @click="$emit('success', mode === 'create' ? 41 : 73)">成功</button>
      <button type="button" :data-testid="\`dialog-close-\${mode}\`" @click="$emit('update:modelValue', false)">关闭</button>
    </section>
  `,
})

const user: User = {
  id: 7,
  username: 'alice',
  email: 'alice@example.com',
  created_at: '2026-07-24T08:00:00Z',
}

const project: ProjectListItem = {
  id: 11,
  name: 'Alpha 项目',
  description: '跨团队交付',
  owner_id: 7,
  invite_code: 'ALPHA11',
  created_at: '2026-07-24T08:00:00Z',
  role: 'owner',
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

function mountView(options: { projects?: ProjectListItem[], loaded?: boolean } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  const projectsStore = useProjectsStore()
  auth.token = 'header.payload.signature'
  auth.user = user
  projectsStore.projects = options.projects ?? []
  projectsStore.loaded = options.loaded ?? false
  const loadProjects = vi.spyOn(projectsStore, 'loadProjects').mockResolvedValue()
  const wrapper = mount(DashboardView, {
    global: {
      plugins: [pinia, ElementPlus],
      stubs: { ProjectDialog: ProjectDialogStub },
    },
  })

  return { auth, loadProjects, projectsStore, wrapper }
}

describe('DashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    push.mockResolvedValue(undefined)
    replace.mockResolvedValue(undefined)
  })

  it('loads projects on mount and shows the current user, workspace title, and actions', async () => {
    const { loadProjects, wrapper } = mountView()
    await flushPromises()

    expect(loadProjects).toHaveBeenCalledOnce()
    expect(loadProjects).toHaveBeenCalledWith()
    expect(wrapper.get('header').text()).toContain('TeamFlow')
    expect(wrapper.get('[data-testid="current-user"]').text()).toContain('alice')
    expect(wrapper.get('main h1').text()).toBe('项目工作区')
    expect(wrapper.get('[data-testid="open-join-dialog"]').text()).toBe('加入项目')
    expect(wrapper.get('[data-testid="open-create-dialog"]').text()).toBe('新建项目')
    expect(wrapper.text()).not.toMatch(/统计|完成率|待办任务/)
  })

  it('passes store state to the list and force reloads on retry', async () => {
    const { loadProjects, projectsStore, wrapper } = mountView()
    projectsStore.error = {
      status: 500,
      code: 'internal_error',
      message: 'internal detail',
      details: [],
    }
    await flushPromises()

    await wrapper.get('[data-testid="project-retry"]').trigger('click')
    expect(loadProjects).toHaveBeenLastCalledWith({ force: true })
  })

  it('opens and closes both project dialogs from page and empty-state commands', async () => {
    const { wrapper } = mountView({ loaded: true })
    await flushPromises()

    await wrapper.get('[data-testid="open-create-dialog"]').trigger('click')
    expect(wrapper.find('[data-testid="dialog-create"]').exists()).toBe(true)
    await wrapper.get('[data-testid="dialog-close-create"]').trigger('click')
    expect(wrapper.find('[data-testid="dialog-create"]').exists()).toBe(false)

    await wrapper.get('[data-testid="empty-join"]').trigger('click')
    expect(wrapper.find('[data-testid="dialog-join"]').exists()).toBe(true)
    await wrapper.get('[data-testid="dialog-close-join"]').trigger('click')
    expect(wrapper.find('[data-testid="dialog-join"]').exists()).toBe(false)
  })

  it('pushes the selected or successfully created/joined project route', async () => {
    const { wrapper } = mountView({ projects: [project], loaded: true })
    await flushPromises()

    await wrapper.get('[data-testid="project-item"] button').trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/project/11')

    await wrapper.get('[data-testid="open-create-dialog"]').trigger('click')
    await wrapper.get('[data-testid="dialog-success-create"]').trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/project/41')

    await wrapper.get('[data-testid="open-join-dialog"]').trigger('click')
    await wrapper.get('[data-testid="dialog-success-join"]').trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/project/73')
  })

  it('shows a safe navigation alert while preserving the project list', async () => {
    push.mockRejectedValueOnce(new Error('router internals'))
    const { wrapper } = mountView({ projects: [project], loaded: true })
    await flushPromises()

    await wrapper.get('[data-testid="project-item"] button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="project-navigation-error"]').text()).toBe('无法打开项目，请重试。')
    expect(wrapper.text()).not.toContain('router internals')
    expect(wrapper.findAll('[data-testid="project-item"]')).toHaveLength(1)
  })

  it('clears the session and replaces the route after logout succeeds', async () => {
    const { auth, wrapper } = mountView()
    vi.spyOn(auth, 'logout').mockImplementation(async () => {
      auth.clearSession()
    })

    await wrapper.get('[data-testid="logout-button"]').trigger('click')
    await flushPromises()

    expect(auth.logout).toHaveBeenCalledOnce()
    expect(auth.user).toBeNull()
    expect(auth.token).toBeNull()
    expect(replace).toHaveBeenCalledExactlyOnceWith('/login')
  })

  it('does not let an older project navigation failure overwrite a newer success', async () => {
    const olderNavigation = deferred<void>()
    const newerNavigation = deferred<void>()
    push
      .mockReturnValueOnce(olderNavigation.promise)
      .mockReturnValueOnce(newerNavigation.promise)
    const { wrapper } = mountView({ projects: [project], loaded: true })
    await flushPromises()
    const projectButton = wrapper.get('[data-testid="project-item"] button')

    await projectButton.trigger('click')
    await projectButton.trigger('click')
    newerNavigation.resolve()
    await flushPromises()
    olderNavigation.reject(new Error('old navigation failed'))
    await flushPromises()

    expect(push).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('old navigation failed')
  })

  it('does not let an old project failure overwrite logout navigation state', async () => {
    const projectNavigation = deferred<void>()
    push.mockReturnValueOnce(projectNavigation.promise)
    replace.mockRejectedValueOnce(new Error('logout navigation failed'))
    const { auth, wrapper } = mountView({ projects: [project], loaded: true })
    vi.spyOn(auth, 'logout').mockImplementation(async () => {
      auth.clearSession()
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-item"] button').trigger('click')
    await wrapper.get('[data-testid="logout-button"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="logout-navigation-error"]').text()).toBe(
      '已退出登录，但页面跳转失败，请重试。',
    )

    projectNavigation.reject(new Error('old project navigation failed'))
    await flushPromises()

    expect(wrapper.get('[data-testid="logout-navigation-error"]').text()).toBe(
      '已退出登录，但页面跳转失败，请重试。',
    )
    expect(wrapper.find('[data-testid="project-navigation-error"]').exists()).toBe(false)
  })

  it('still clears the session and replaces the route when logout rejects', async () => {
    const { auth, wrapper } = mountView()
    vi.spyOn(auth, 'logout').mockImplementation(async () => {
      auth.clearSession()
      throw new Error('network unavailable')
    })

    await wrapper.get('[data-testid="logout-button"]').trigger('click')
    await flushPromises()

    expect(auth.user).toBeNull()
    expect(auth.token).toBeNull()
    expect(replace).toHaveBeenCalledExactlyOnceWith('/login')
  })

  it('blocks duplicate logout attempts and exposes its busy state', async () => {
    const logoutRequest = deferred<void>()
    const { auth, wrapper } = mountView()
    const logout = vi.spyOn(auth, 'logout').mockReturnValue(logoutRequest.promise)
    const button = wrapper.get('[data-testid="logout-button"]')

    await button.trigger('click')
    await button.trigger('click')

    expect(logout).toHaveBeenCalledOnce()
    expect(button.attributes()).toHaveProperty('disabled')
    expect(button.attributes('aria-busy')).toBe('true')

    logoutRequest.resolve()
    await flushPromises()

    expect(replace).toHaveBeenCalledExactlyOnceWith('/login')
  })

  it('recovers and shows a safe message when login navigation fails', async () => {
    const { auth, wrapper } = mountView()
    vi.spyOn(auth, 'logout').mockImplementation(async () => {
      auth.clearSession()
    })
    replace.mockRejectedValueOnce(new Error('navigation failed'))
    const button = wrapper.get('[data-testid="logout-button"]')

    await button.trigger('click')
    await flushPromises()

    expect(auth.user).toBeNull()
    expect(replace).toHaveBeenCalledExactlyOnceWith('/login')
    expect(button.attributes()).not.toHaveProperty('disabled')
    expect(button.attributes('aria-busy')).toBe('false')
    expect(wrapper.get('[data-testid="logout-navigation-error"]').text()).toBe('已退出登录，但页面跳转失败，请重试。')
  })
})
