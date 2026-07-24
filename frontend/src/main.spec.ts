import { readFileSync } from 'node:fs'

import type { Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { useAuthStore } from '@/stores/auth'

import { setUnauthorizedHandler } from '@/api/http'
import { readSessionEpoch } from '@/api/token'

import { createBootstrap, installUnauthorizedHandler, type BootstrapDependencies } from './bootstrap'

vi.mock('@/api/http', () => ({
  setUnauthorizedHandler: vi.fn(),
}))

type AuthStore = ReturnType<typeof useAuthStore>
const cleanups: Array<() => void> = []

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

function setup(fullPath = '/projects/42?tab=activity#latest', path = '/projects/42') {
  const auth = { clearSession: vi.fn(), token: 'jwt-A' } as unknown as AuthStore
  vi.mocked(auth.clearSession).mockImplementation(() => {
    auth.token = null
  })
  const router = {
    currentRoute: { value: { fullPath, path } },
    replace: vi.fn().mockResolvedValue(undefined),
  } as unknown as Router
  const hardRedirect = vi.fn()

  const cleanup = installUnauthorizedHandler(auth, router, hardRedirect)
  cleanups.push(cleanup)
  const handler = vi.mocked(setUnauthorizedHandler).mock.calls.at(-1)?.[0]

  if (!handler) {
    throw new Error('Unauthorized handler was not installed')
  }

  return { auth, cleanup, handler, hardRedirect, router }
}

describe('installUnauthorizedHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) {
      cleanup()
    }
    vi.restoreAllMocks()
  })

  it('clears synchronously and redirects to login with the safe current full path', () => {
    const { auth, handler, router } = setup()

    handler({ epoch: readSessionEpoch(), token: 'jwt-A' })

    expect(auth.clearSession).toHaveBeenCalledOnce()
    expect(router.replace).toHaveBeenCalledExactlyOnceWith({
      path: '/login',
      query: { redirect: '/projects/42?tab=activity#latest' },
    })
  })

  it('unregisters the handler and deactivates stale callback references on cleanup', () => {
    const { auth, cleanup, handler, router } = setup()

    cleanup()

    expect(setUnauthorizedHandler).toHaveBeenLastCalledWith(null)

    handler({ epoch: readSessionEpoch(), token: 'jwt-A' })
    expect(auth.clearSession).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('clears without navigating when already on login', () => {
    const { auth, handler, router } = setup('/login?redirect=/dashboard', '/login')

    handler({ epoch: readSessionEpoch(), token: 'jwt-A' })

    expect(auth.clearSession).toHaveBeenCalledOnce()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it.each(['//evil.example/path', '/https://evil.example', '/dashboard\\next'])(
    'falls back to dashboard for an unsafe current path %j',
    (fullPath) => {
      const { handler, router } = setup(fullPath)

      handler({ epoch: readSessionEpoch(), token: 'jwt-A' })

      expect(router.replace).toHaveBeenCalledExactlyOnceWith({
        path: '/login',
        query: { redirect: '/dashboard' },
      })
    },
  )

  it('deduplicates navigation while clearing for every concurrent 401', async () => {
    const navigation = deferred<void>()
    const { auth, handler, router } = setup()
    vi.mocked(router.replace).mockReturnValue(navigation.promise)

    handler({ epoch: readSessionEpoch(), token: 'jwt-A' })
    handler({ epoch: readSessionEpoch(), token: 'jwt-A' })

    expect(auth.clearSession).toHaveBeenCalledOnce()
    expect(router.replace).toHaveBeenCalledOnce()

    navigation.resolve()
    await navigation.promise
    await Promise.resolve()
    await Promise.resolve()

    auth.token = 'jwt-A'
    handler({ epoch: readSessionEpoch(), token: 'jwt-A' })
    expect(router.replace).toHaveBeenCalledTimes(2)
  })

  it('keeps a new installation independent when the old one is cleaned up in flight', async () => {
    const oldNavigation = deferred<void>()
    const oldInstallation = setup('/old?tab=activity', '/old')
    vi.mocked(oldInstallation.router.replace).mockReturnValue(oldNavigation.promise)
    oldInstallation.handler({ epoch: readSessionEpoch(), token: 'jwt-A' })
    oldInstallation.cleanup()

    const newNavigation = deferred<void>()
    const newInstallation = setup('/new?tab=mine#today', '/new')
    vi.mocked(newInstallation.router.replace).mockReturnValue(newNavigation.promise)
    newInstallation.handler({ epoch: readSessionEpoch(), token: 'jwt-A' })

    expect(newInstallation.router.replace).toHaveBeenCalledOnce()

    oldNavigation.resolve()
    await oldNavigation.promise
    await Promise.resolve()
    await Promise.resolve()

    const setterCallsBeforeRepeatedCleanup = vi.mocked(setUnauthorizedHandler).mock.calls.length
    oldInstallation.cleanup()
    expect(setUnauthorizedHandler).toHaveBeenCalledTimes(setterCallsBeforeRepeatedCleanup)

    newInstallation.handler({ epoch: readSessionEpoch(), token: 'jwt-A' })
    expect(newInstallation.auth.clearSession).toHaveBeenCalledOnce()
    expect(newInstallation.router.replace).toHaveBeenCalledOnce()

    newNavigation.resolve()
    await newNavigation.promise
    await Promise.resolve()
    await Promise.resolve()

    newInstallation.auth.token = 'jwt-A'
    newInstallation.handler({ epoch: readSessionEpoch(), token: 'jwt-A' })
    expect(newInstallation.router.replace).toHaveBeenCalledTimes(2)
  })

  it('reports a rejected redirect without creating an unhandled rejection', async () => {
    const navigationError = new Error('navigation failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { handler, router } = setup()
    vi.mocked(router.replace).mockRejectedValue(navigationError)

    handler({ epoch: readSessionEpoch(), token: 'jwt-A' })
    await Promise.resolve()
    await Promise.resolve()

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      'Unauthorized redirect failed',
      navigationError,
    )
  })
})

function createBootstrapHarness() {
  const reload = vi.fn()
  const app = {
    component: vi.fn(),
    mount: vi.fn(),
    unmount: vi.fn(),
    use: vi.fn(),
  }
  const cleanupUnauthorized = vi.fn()
  const dependencies = {
    createPinia: vi.fn(() => ({})),
    createRouter: vi.fn(() => ({})),
    createVueApp: vi.fn(() => app),
    getAuthStore: vi.fn(() => ({})),
    installUnauthorized: vi.fn(() => cleanupUnauthorized),
    reload,
  } as unknown as Partial<BootstrapDependencies>

  const bootstrap = createBootstrap(dependencies)

  return { app, bootstrap, cleanupUnauthorized, reload }
}

describe('createBootstrap storage synchronization', () => {
  it('registers only the required Element Plus components in exact order', () => {
    const { app, bootstrap } = createBootstrapHarness()

    expect(app.component.mock.calls.map(([name]) => name)).toEqual([
      'ElButton',
      'ElForm',
      'ElFormItem',
      'ElInput',
      'ElDialog',
      'ElInputNumber',
      'ElSelect',
      'ElOption',
      'ElTooltip',
    ])

    bootstrap.dispose()
  })

  it('reloads when another tab replaces or removes the access token', () => {
    const { bootstrap, reload } = createBootstrapHarness()

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'teamflow.access_token',
      newValue: 'jwt-B',
      oldValue: 'jwt-A',
    }))
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'teamflow.access_token',
      newValue: null,
      oldValue: 'jwt-B',
    }))

    expect(reload).toHaveBeenCalledTimes(2)
    bootstrap.dispose()
  })

  it('ignores unrelated keys and unchanged access-token values', () => {
    const { bootstrap, reload } = createBootstrapHarness()

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'unrelated',
      newValue: 'jwt-B',
      oldValue: 'jwt-A',
    }))
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'teamflow.access_token',
      newValue: 'jwt-A',
      oldValue: 'jwt-A',
    }))

    expect(reload).not.toHaveBeenCalled()
    bootstrap.dispose()
  })

  it('installs once per lifecycle and removes the listener on dispose', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const { bootstrap, reload } = createBootstrapHarness()

    bootstrap.mount('#app')
    bootstrap.mount('#app')

    const storageInstallations = addEventListener.mock.calls.filter(([type]) => type === 'storage')
    expect(storageInstallations).toHaveLength(1)

    bootstrap.dispose()
    bootstrap.dispose()

    const storageRemovals = removeEventListener.mock.calls.filter(([type]) => type === 'storage')
    expect(storageRemovals).toHaveLength(1)

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'teamflow.access_token',
      newValue: 'jwt-B',
      oldValue: 'jwt-A',
    }))
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('selective Element Plus styles', () => {
  it('imports the MessageBox component CSS beside its direct service import', () => {
    const source = readFileSync('src/views/ProjectBoardView.vue', 'utf8')

    expect(source).toMatch(
      /import ['"]element-plus\/(?:es\/components\/message-box\/style\/css|theme-chalk\/el-message-box\.css)['"]/,
    )
  })
})
