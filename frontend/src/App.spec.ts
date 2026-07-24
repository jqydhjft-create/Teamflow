import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import { useAuthStore } from '@/stores/auth'

import App from './App.vue'

function mountApp(initialized: boolean) {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.initialized = initialized

  return mount(App, {
    global: {
      plugins: [pinia],
      stubs: {
        RouterView: {
          template: '<div data-testid="router-outlet">route content</div>',
        },
      },
    },
  })
}

describe('App', () => {
  it('shows a stable full-page busy region while the session is restoring', () => {
    const wrapper = mountApp(false)
    const loading = wrapper.get('[aria-busy="true"]')

    expect(loading.classes()).toContain('app-loading')
    expect(loading.get('[role="status"]').text()).toBe('正在恢复登录状态')
    expect(wrapper.find('[data-testid="router-outlet"]').exists()).toBe(false)
  })

  it('renders the current route after auth initialization', () => {
    const wrapper = mountApp(true)

    expect(wrapper.get('[data-testid="router-outlet"]').text()).toBe('route content')
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(false)
  })
})
