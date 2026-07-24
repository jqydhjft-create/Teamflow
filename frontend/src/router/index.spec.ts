import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'

import type { User } from '@/types/auth'

import { getCurrentUser } from '@/api/auth'
import { readToken } from '@/api/token'
import { useAuthStore } from '@/stores/auth'

import { createAppRouter, resolveSafeRedirect } from './index'

vi.mock('@/api/auth', () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}))

vi.mock('@/api/token', () => ({
  advanceSessionEpoch: vi.fn(),
  clearToken: vi.fn(),
  readToken: vi.fn(),
  writeToken: vi.fn(),
}))

const user: User = {
  id: 7,
  username: 'alice',
  email: 'alice@example.com',
  created_at: '2026-07-24T08:00:00Z',
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function setupRouter() {
  const pinia = createPinia()
  const router = createAppRouter(pinia, createMemoryHistory())

  return { pinia, router, store: useAuthStore(pinia) }
}

describe('resolveSafeRedirect', () => {
  it.each([
    ['/projects/42?tab=activity#latest', '/projects/42?tab=activity#latest'],
    ['/dashboard', '/dashboard'],
    ['/login', '/dashboard'],
    ['/login?redirect=/dashboard', '/dashboard'],
  ])('resolves %j to %j', (value, expected) => {
    expect(resolveSafeRedirect(value)).toBe(expected)
  })

  it.each([
    undefined,
    null,
    '',
    [],
    ['/dashboard'],
    'dashboard',
    '//evil.example/path',
    String.raw`/\evil.example`,
    String.raw`\evil.example`,
    '/https://evil.example',
    '/javascript:alert(1)',
    '/dashboard\next',
    '/dashboard\u0000next',
    '/dashboard\nnext',
  ])('rejects unsafe redirect value %j', (value) => {
    expect(resolveSafeRedirect(value)).toBe('/dashboard')
  })
})

describe('app router auth guard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(readToken).mockReturnValue(null)
  })

  it.each(['login', 'dashboard'])('loads the %s view lazily', async (routeName) => {
    const { router } = setupRouter()
    const route = router.getRoutes().find(({ name }) => name === routeName)
    const component = route?.components?.default

    expect(component).toBeTypeOf('function')
    await expect((component as () => Promise<unknown>)()).resolves.toBeDefined()
  })

  it('registers the project board as a lazy authenticated route before the catch-all', () => {
    const { router } = setupRouter()
    const routes = router.getRoutes()
    const route = routes.find(({ name }) => name === 'project-board')

    expect(route?.path).toBe('/project/:id')
    expect(route?.meta).toMatchObject({ requiresAuth: true })
    expect(route?.components?.default).toBeTypeOf('function')
  })

  it('isolates auth state and restore mocks between injected Pinia instances', async () => {
    const first = setupRouter()
    const second = setupRouter()
    const firstRestore = vi.spyOn(first.store, 'restoreSession').mockImplementation(async () => {
      first.store.token = 'first-token'
      first.store.user = user
    })
    const secondRestore = vi.spyOn(second.store, 'restoreSession').mockResolvedValue()

    await Promise.all([
      first.router.push('/dashboard'),
      second.router.push('/dashboard'),
    ])

    expect(firstRestore).toHaveBeenCalledOnce()
    expect(secondRestore).toHaveBeenCalledTimes(2)
    expect(first.router.currentRoute.value.fullPath).toBe('/dashboard')
    expect(second.router.currentRoute.value.path).toBe('/login')
    expect(second.store.token).toBeNull()
    expect(second.store.user).toBeNull()
  })

  it('redirects an unauthenticated protected navigation to login with its full path', async () => {
    const { router } = setupRouter()

    await router.push('/dashboard?view=mine#today')

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query).toEqual({ redirect: '/dashboard?view=mine#today' })
  })

  it('preserves the full project board location when redirecting an unauthenticated user', async () => {
    const { router } = setupRouter()

    await router.push('/project/17?view=mine#today')

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query).toEqual({ redirect: '/project/17?view=mine#today' })
  })

  it.each(['/project/invalid', '/project/0', '/project/-4']) (
    'keeps invalid project id %s on the protected board route',
    async (path) => {
      const { router, store } = setupRouter()
      store.token = 'header.payload.signature'
      store.user = user
      store.initialized = true

      await router.push(path)

      expect(router.currentRoute.value.name).toBe('project-board')
      expect(router.currentRoute.value.fullPath).toBe(path)
    },
  )

  it.each(['/project/invalid?view=mine#today', '/project/0?view=mine#today', '/project/-4?view=mine#today'])(
    'authenticates invalid project location %s before the page handles its id',
    async (path) => {
      const { router } = setupRouter()

      await router.push(path)

      expect(router.currentRoute.value.path).toBe('/login')
      expect(router.currentRoute.value.query).toEqual({ redirect: path })
    },
  )

  it('sends an authenticated login navigation to its safe redirect', async () => {
    const { router, store } = setupRouter()
    store.token = 'header.payload.signature'
    store.user = user
    store.initialized = true

    await router.push('/login?redirect=/dashboard%3Ftab=activity%23latest')

    expect(router.currentRoute.value.fullPath).toBe('/dashboard?tab=activity#latest')
  })

  it('rejects an external login redirect for an authenticated user', async () => {
    const { router, store } = setupRouter()
    store.token = 'header.payload.signature'
    store.user = user
    store.initialized = true

    await router.push('/login?redirect=//evil.example/path')

    expect(router.currentRoute.value.fullPath).toBe('/dashboard')
  })

  it('awaits session restoration before deciding whether a protected route is allowed', async () => {
    const restoredUser = deferred<User>()
    vi.mocked(readToken).mockReturnValue('stored-token')
    vi.mocked(getCurrentUser).mockReturnValue(restoredUser.promise)
    const { router } = setupRouter()

    const navigation = router.push('/dashboard')
    await Promise.resolve()
    await Promise.resolve()

    expect(router.currentRoute.value.fullPath).toBe('/')

    restoredUser.resolve(user)
    await navigation

    expect(router.currentRoute.value.fullPath).toBe('/dashboard')
  })

  it('redirects an unknown path to dashboard without looping', async () => {
    const { router } = setupRouter()

    await router.push('/missing')

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query).toEqual({ redirect: '/dashboard' })
  })

  it('does not loop when an authenticated user targets login as a redirect', async () => {
    const { router, store } = setupRouter()
    store.token = 'header.payload.signature'
    store.user = user
    store.initialized = true

    await router.push('/login?redirect=/login%3Fredirect=/login')

    expect(router.currentRoute.value.fullPath).toBe('/dashboard')
  })
})
