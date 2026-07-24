import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import type { Pinia } from 'pinia'
import { createPinia } from 'pinia'
import type { App as VueApp } from 'vue'
import { createMemoryHistory, createRouter, isNavigationFailure, type Router } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { http, setUnauthorizedHandler } from '@/api/http'
import * as authApi from '@/api/auth'
import { advanceSessionEpoch, clearToken, writeToken } from '@/api/token'
import { useAuthStore } from '@/stores/auth'
import type { AuthData, LoginPayload, User } from '@/types/auth'

import { createBootstrap, installUnauthorizedHandler } from './bootstrap'

type AuthStore = ReturnType<typeof useAuthStore>

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function setupUnauthorized(
  token: string | null = 'jwt-A',
  hardRedirect = vi.fn(),
) {
  const auth = {
    token,
    clearSession: vi.fn(),
  } as unknown as AuthStore
  vi.mocked(auth.clearSession).mockImplementation(() => {
    auth.token = null
  })
  const currentRoute = {
    value: { fullPath: '/projects/42?tab=activity#latest', path: '/projects/42' },
  }
  const router = {
    currentRoute,
    replace: vi.fn().mockImplementation(async () => {
      currentRoute.value = { fullPath: '/login', path: '/login' }
    }),
  } as unknown as Router
  const cleanup = installUnauthorizedHandler(auth, router, hardRedirect)

  return { auth, cleanup, hardRedirect, router }
}

function unauthorizedAdapter(waitForResponse?: Promise<void>): AxiosAdapter {
  return async (config) => {
    await waitForResponse
    const response: AxiosResponse = {
      config,
      data: null,
      headers: {},
      status: 401,
      statusText: 'Unauthorized',
    }

    throw new AxiosError(
      'Request failed with status code 401',
      AxiosError.ERR_BAD_REQUEST,
      config as InternalAxiosRequestConfig,
      undefined,
      response,
    )
  }
}

afterEach(() => {
  setUnauthorizedHandler(null)
  clearToken()
  vi.restoreAllMocks()
})

describe('installUnauthorizedHandler', () => {
  it('clears and redirects once for matching concurrent responses', async () => {
    const navigation = deferred<void>()
    const runtime = setupUnauthorized('jwt-A')
    vi.mocked(runtime.router.replace).mockReturnValue(navigation.promise)

    writeToken('jwt-A')
    const first = http.get('/one', { adapter: unauthorizedAdapter() }).catch(() => undefined)
    const second = http.get('/two', { adapter: unauthorizedAdapter() }).catch(() => undefined)
    await Promise.all([first, second])

    expect(runtime.auth.clearSession).toHaveBeenCalledOnce()
    expect(runtime.router.replace).toHaveBeenCalledOnce()

    navigation.resolve()
    await navigation.promise
    runtime.cleanup()
  })

  it('uses a hard redirect when router replacement rejects', async () => {
    const runtime = setupUnauthorized('jwt-A')
    const navigationError = new Error('router failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(runtime.router.replace).mockRejectedValue(navigationError)
    writeToken('jwt-A')

    await http.get('/protected', { adapter: unauthorizedAdapter() }).catch(() => undefined)
    await Promise.resolve()

    expect(runtime.hardRedirect).toHaveBeenCalledExactlyOnceWith('/login')
    expect(consoleError).toHaveBeenCalledWith('Unauthorized redirect failed', navigationError)
    runtime.cleanup()
  })

  it('uses a hard redirect when router replacement resolves with a navigation failure', async () => {
    const actualRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/old', component: { template: '<div />' } },
        { path: '/login', component: { template: '<div />' } },
      ],
    })
    actualRouter.beforeEach((to) => to.path !== '/login')
    await actualRouter.push('/old')
    const navigationFailure = await actualRouter.push('/login')
    expect(isNavigationFailure(navigationFailure)).toBe(true)

    const runtime = setupUnauthorized('jwt-A')
    vi.mocked(runtime.router.replace).mockResolvedValue(navigationFailure)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    writeToken('jwt-A')

    await http.get('/protected', { adapter: unauthorizedAdapter() }).catch(() => undefined)
    await Promise.resolve()

    expect(runtime.hardRedirect).toHaveBeenCalledExactlyOnceWith('/login')
    runtime.cleanup()
  })

  it('does not hard redirect after a successful router navigation to login', async () => {
    const runtime = setupUnauthorized('jwt-A')
    writeToken('jwt-A')

    await http.get('/protected', { adapter: unauthorizedAdapter() }).catch(() => undefined)
    await Promise.resolve()

    expect(runtime.router.currentRoute.value.path).toBe('/login')
    expect(runtime.hardRedirect).not.toHaveBeenCalled()
    runtime.cleanup()
  })

  it('uses a hard redirect when router replacement throws synchronously', async () => {
    const runtime = setupUnauthorized('jwt-A')
    vi.mocked(runtime.router.replace).mockImplementation(() => {
      throw new Error('router exploded')
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    writeToken('jwt-A')

    await http.get('/protected', { adapter: unauthorizedAdapter() }).catch(() => undefined)

    expect(runtime.hardRedirect).toHaveBeenCalledExactlyOnceWith('/login')
    runtime.cleanup()
  })

  it('logs a hard redirect failure without throwing from the handler', async () => {
    const hardRedirectError = new Error('location blocked')
    const runtime = setupUnauthorized('jwt-A', vi.fn(() => {
      throw hardRedirectError
    }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(runtime.router.replace).mockRejectedValue(new Error('router failed'))
    writeToken('jwt-A')

    await http.get('/protected', { adapter: unauthorizedAdapter() }).catch(() => undefined)
    await Promise.resolve()

    expect(consoleError).toHaveBeenCalledWith('Unauthorized hard redirect failed', hardRedirectError)
    runtime.cleanup()
  })
})

describe('HTTP unauthorized integration', () => {
  it('ignores stale request snapshots and handles the current token', async () => {
    const runtime = setupUnauthorized('jwt-B')
    const staleResponse = deferred<void>()

    writeToken('jwt-A')
    const staleRequest = http.get('/stale', { adapter: unauthorizedAdapter(staleResponse.promise) })
    await Promise.resolve()
    writeToken('jwt-B')
    staleResponse.resolve()
    await staleRequest.catch(() => undefined)

    expect(runtime.auth.clearSession).not.toHaveBeenCalled()
    expect(runtime.router.replace).not.toHaveBeenCalled()

    await http.get('/current', { adapter: unauthorizedAdapter() }).catch(() => undefined)

    expect(runtime.auth.clearSession).toHaveBeenCalledOnce()
    expect(runtime.router.replace).toHaveBeenCalledOnce()
    runtime.cleanup()
  })

  it('ignores an old 401 when a same-token login has already advanced the epoch', async () => {
    const oldUser: User = {
      id: 1,
      username: 'old-user',
      email: 'old@example.com',
      created_at: '2026-07-24T08:00:00Z',
    }
    const newUser = { ...oldUser, id: 2, username: 'new-user' }
    const loginPayload: LoginPayload = {
      username_or_email: 'new-user',
      password: 'correct horse battery staple',
    }
    const loginResponse = deferred<AuthData>()
    vi.spyOn(authApi, 'login').mockReturnValue(loginResponse.promise)
    const pinia = createPinia()
    const auth = useAuthStore(pinia)
    auth.token = 'jwt-A'
    auth.user = oldUser
    writeToken('jwt-A')
    advanceSessionEpoch()

    const currentRoute = {
      value: { fullPath: '/dashboard', path: '/dashboard' },
    }
    const router = {
      currentRoute,
      replace: vi.fn().mockImplementation(async () => {
        currentRoute.value = { fullPath: '/login', path: '/login' }
      }),
    } as unknown as Router
    const hardRedirect = vi.fn()
    const cleanup = installUnauthorizedHandler(auth, router, hardRedirect)
    const oldResponse = deferred<void>()
    const oldRequest = http.get('/old', { adapter: unauthorizedAdapter(oldResponse.promise) })
    await Promise.resolve()

    const loggingIn = auth.login(loginPayload)
    oldResponse.resolve()
    await oldRequest.catch(() => undefined)

    expect(auth.token).toBe('jwt-A')
    expect(auth.user).toEqual(oldUser)
    expect(router.replace).not.toHaveBeenCalled()
    expect(hardRedirect).not.toHaveBeenCalled()

    loginResponse.resolve({ token: 'jwt-A', user: newUser })
    await loggingIn

    expect(auth.token).toBe('jwt-A')
    expect(auth.user).toEqual(newUser)
    expect(auth.isAuthenticated).toBe(true)
    cleanup()
  })
})

describe('createBootstrap', () => {
  it('constructs in order, registers only required components and plugins, then mounts', () => {
    const order: string[] = []
    const pinia = { install: vi.fn() } as unknown as Pinia
    const router = { install: vi.fn() } as unknown as Router
    const cleanup = vi.fn()
    const app = {
      component: vi.fn((name: string) => {
        order.push(`component:${name}`)
        return app
      }),
      mount: vi.fn(() => {
        order.push('mount')
        return {}
      }),
      unmount: vi.fn(),
      use: vi.fn((plugin: unknown) => {
        order.push(plugin === pinia ? 'use:pinia' : 'use:router')
        return app
      }),
    } as unknown as VueApp

    const runtime = createBootstrap({
      createPinia: () => {
        order.push('pinia')
        return pinia
      },
      createRouter: (createdPinia) => {
        expect(createdPinia).toBe(pinia)
        order.push('router')
        return router
      },
      createVueApp: () => {
        order.push('app')
        return app
      },
      getAuthStore: () => ({ token: null }) as AuthStore,
      installUnauthorized: () => {
        order.push('unauthorized')
        return cleanup
      },
    })

    runtime.mount('#app')

    expect(order).toEqual([
      'pinia',
      'router',
      'app',
      'unauthorized',
      'component:ElButton',
      'component:ElForm',
      'component:ElFormItem',
      'component:ElInput',
      'component:ElDialog',
      'component:ElInputNumber',
      'component:ElSelect',
      'component:ElOption',
      'component:ElTooltip',
      'use:pinia',
      'use:router',
      'mount',
    ])
    expect(app.mount).toHaveBeenCalledExactlyOnceWith('#app')

    runtime.dispose()
    runtime.dispose()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(app.unmount).toHaveBeenCalledOnce()
  })
})
