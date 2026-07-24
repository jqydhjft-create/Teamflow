import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthData, LoginPayload, RegisterPayload, User } from '@/types/auth'

import { getCurrentUser, login as requestLogin, logout as requestLogout, register as requestRegister } from '@/api/auth'
import { advanceSessionEpoch, clearToken, readToken, writeToken } from '@/api/token'
import type { Project, ProjectListItem, ProjectMember } from '@/types/project'
import type { Task } from '@/types/task'

import { useAuthStore } from './auth'
import { useBoardStore } from './board'
import { useProjectsStore } from './projects'

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

const authData: AuthData = {
  user,
  token: 'header.payload.signature',
}

const loginPayload: LoginPayload = {
  username_or_email: 'alice@example.com',
  password: 'correct horse battery staple',
}

const registerPayload: RegisterPayload = {
  username: 'alice',
  email: 'alice@example.com',
  password: 'correct horse battery staple',
}

const previousProject: ProjectListItem = {
  id: 31,
  name: 'Previous workspace',
  description: null,
  owner_id: user.id,
  invite_code: 'OLD031',
  created_at: '2026-07-24T08:00:00Z',
  role: 'owner',
}

const previousMember: ProjectMember = {
  user_id: user.id,
  username: user.username,
  email: user.email,
  role: 'owner',
}

const previousTask: Task = {
  id: 44,
  project_id: previousProject.id,
  title: 'Previous user task',
  description: null,
  status: 'todo',
  priority: 'medium',
  assignee_id: user.id,
  sort_order: 1,
  comment_count: 0,
  created_at: '2026-07-24T08:30:00Z',
}

function seedPreviousSessionState() {
  const projects = useProjectsStore()
  const board = useBoardStore()

  projects.projects = [previousProject]
  projects.loaded = true
  board.currentProjectId = previousProject.id
  board.project = previousProject satisfies Project
  board.members = [previousMember]
  board.tasks = [previousTask]
  board.loaded = true

  return { board, projects }
}

function expectSessionStateReset(
  projects: ReturnType<typeof useProjectsStore>,
  board: ReturnType<typeof useBoardStore>,
): void {
  expect(projects.projects).toEqual([])
  expect(projects.loaded).toBe(false)
  expect(board.currentProjectId).toBeNull()
  expect(board.project).toBeNull()
  expect(board.members).toEqual([])
  expect(board.tasks).toEqual([])
  expect(board.loaded).toBe(false)
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

describe('auth store', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    vi.mocked(readToken).mockReturnValue(null)
  })

  it('starts unauthenticated and uninitialized', () => {
    const store = useAuthStore()

    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(store.initialized).toBe(false)
    expect(store.isAuthenticated).toBe(false)
  })

  it('clears project directory and board state as soon as logout starts', async () => {
    const logoutRequest = deferred<void>()
    vi.mocked(requestLogout).mockReturnValue(logoutRequest.promise)
    const store = useAuthStore()
    store.token = authData.token
    store.user = user
    const { board, projects } = seedPreviousSessionState()

    const loggingOut = store.logout()

    expectSessionStateReset(projects, board)
    logoutRequest.resolve()
    await loggingOut
  })

  it('clears previous session state before a new login response settles', async () => {
    const loginRequest = deferred<AuthData>()
    vi.mocked(requestLogin).mockReturnValue(loginRequest.promise)
    const store = useAuthStore()
    const { board, projects } = seedPreviousSessionState()

    const loggingIn = store.login(loginPayload)

    expectSessionStateReset(projects, board)
    loginRequest.resolve(authData)
    await loggingIn
  })

  it('logs in, persists the token, and publishes the session', async () => {
    vi.mocked(requestLogin).mockResolvedValue(authData)
    const store = useAuthStore()

    await expect(store.login(loginPayload)).resolves.toEqual(authData)

    expect(requestLogin).toHaveBeenCalledExactlyOnceWith(loginPayload)
    expect(advanceSessionEpoch).toHaveBeenCalledOnce()
    expect(writeToken).toHaveBeenCalledExactlyOnceWith(authData.token)
    expect(store.token).toBe(authData.token)
    expect(store.user).toEqual(user)
    expect(store.isAuthenticated).toBe(true)
  })

  it('registers, persists the token, and publishes the session', async () => {
    vi.mocked(requestRegister).mockResolvedValue(authData)
    const store = useAuthStore()

    await expect(store.register(registerPayload)).resolves.toEqual(authData)

    expect(requestRegister).toHaveBeenCalledExactlyOnceWith(registerPayload)
    expect(advanceSessionEpoch).toHaveBeenCalledOnce()
    expect(writeToken).toHaveBeenCalledExactlyOnceWith(authData.token)
    expect(store.token).toBe(authData.token)
    expect(store.user).toEqual(user)
    expect(store.isAuthenticated).toBe(true)
  })

  it.each([
    ['login', () => useAuthStore().login(loginPayload), requestLogin],
    ['register', () => useAuthStore().register(registerPayload), requestRegister],
  ] as const)('rolls back the %s session when token persistence fails', async (_name, submit, request) => {
    const storageError = new Error('TOKEN_STORAGE_WRITE_FAILED')
    vi.mocked(request).mockResolvedValue(authData)
    vi.mocked(writeToken).mockImplementation(() => {
      throw storageError
    })
    const store = useAuthStore()
    store.token = 'old-token'
    store.user = { ...user, id: 3 }

    await expect(submit()).rejects.toBe(storageError)

    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(clearToken).toHaveBeenCalledOnce()
  })

  it('clears memory and storage without throwing when clearing storage fails', () => {
    vi.mocked(clearToken).mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    const store = useAuthStore()
    store.token = authData.token
    store.user = user

    expect(() => store.clearSession()).not.toThrow()
    expect(advanceSessionEpoch).toHaveBeenCalledOnce()
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('finishes restore without requesting the user when no token is stored', async () => {
    const store = useAuthStore()
    store.token = 'stale-memory-token'
    store.user = user

    await expect(store.restoreSession()).resolves.toBeUndefined()

    expect(advanceSessionEpoch).toHaveBeenCalledOnce()
    expect(getCurrentUser).not.toHaveBeenCalled()
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(store.initialized).toBe(true)
  })

  it('restores a valid stored session', async () => {
    vi.mocked(readToken).mockReturnValue(authData.token)
    vi.mocked(getCurrentUser).mockResolvedValue(user)
    const store = useAuthStore()

    await expect(store.restoreSession()).resolves.toBeUndefined()

    expect(getCurrentUser).toHaveBeenCalledOnce()
    expect(store.token).toBe(authData.token)
    expect(store.user).toEqual(user)
    expect(store.isAuthenticated).toBe(true)
    expect(store.initialized).toBe(true)
  })

  it('clears an invalid stored session, swallows the restore error, and finishes initialization', async () => {
    vi.mocked(readToken).mockReturnValue(authData.token)
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('unauthorized'))
    const store = useAuthStore()

    await expect(store.restoreSession()).resolves.toBeUndefined()

    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(clearToken).toHaveBeenCalledOnce()
    expect(store.initialized).toBe(true)
  })

  it('does not restore again after initialization has completed', async () => {
    vi.mocked(readToken).mockReturnValue(authData.token)
    vi.mocked(getCurrentUser).mockResolvedValue(user)
    const store = useAuthStore()

    await store.restoreSession()
    await store.restoreSession()

    expect(readToken).toHaveBeenCalledOnce()
    expect(getCurrentUser).toHaveBeenCalledOnce()
  })

  it('shares one in-flight restore between concurrent callers', async () => {
    const currentUser = deferred<User>()
    vi.mocked(readToken).mockReturnValue(authData.token)
    vi.mocked(getCurrentUser).mockReturnValue(currentUser.promise)
    const store = useAuthStore()

    const first = store.restoreSession()
    const second = store.restoreSession()

    await Promise.resolve()

    expect(readToken).toHaveBeenCalledOnce()
    expect(getCurrentUser).toHaveBeenCalledOnce()

    currentUser.resolve(user)
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
    expect(store.isAuthenticated).toBe(true)
    expect(store.initialized).toBe(true)
  })

  it('does not let an old successful restore overwrite a newer login session', async () => {
    const currentUser = deferred<User>()
    const newerUser = { ...user, id: 9, username: 'bob', email: 'bob@example.com' }
    const newerAuthData = { token: 'newer-token', user: newerUser }
    vi.mocked(readToken).mockReturnValue(authData.token)
    vi.mocked(getCurrentUser).mockReturnValue(currentUser.promise)
    vi.mocked(requestLogin).mockResolvedValue(newerAuthData)
    const store = useAuthStore()

    const restoring = store.restoreSession()
    await store.login(loginPayload)
    currentUser.resolve(user)
    await restoring

    expect(store.token).toBe(newerAuthData.token)
    expect(store.user).toEqual(newerUser)
    expect(store.isAuthenticated).toBe(true)
    expect(store.initialized).toBe(true)
  })

  it('does not let an old failed restore clear a newer registered session', async () => {
    const currentUser = deferred<User>()
    const newerAuthData = { token: 'registered-token', user: { ...user, id: 11 } }
    vi.mocked(readToken).mockReturnValue(authData.token)
    vi.mocked(getCurrentUser).mockReturnValue(currentUser.promise)
    vi.mocked(requestRegister).mockResolvedValue(newerAuthData)
    const store = useAuthStore()

    const restoring = store.restoreSession()
    await store.register(registerPayload)
    currentUser.reject(new Error('old token rejected'))
    await restoring

    expect(store.token).toBe(newerAuthData.token)
    expect(store.user).toEqual(newerAuthData.user)
    expect(store.isAuthenticated).toBe(true)
    expect(store.initialized).toBe(true)
  })

  it('keeps the session logged out when a login started before logout resolves later', async () => {
    const loginRequest = deferred<AuthData>()
    vi.mocked(requestLogin).mockReturnValue(loginRequest.promise)
    const store = useAuthStore()

    const loggingIn = store.login(loginPayload)
    await store.logout()
    loginRequest.resolve(authData)

    await expect(loggingIn).resolves.toEqual(authData)
    expect(writeToken).not.toHaveBeenCalled()
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it.each(['resolve', 'reject'] as const)(
    'keeps a newer login when an older logout request later %ss',
    async (outcome) => {
      const logoutRequest = deferred<void>()
      const newerUser = { ...user, id: 13, username: 'carol', email: 'carol@example.com' }
      const newerAuthData = { token: 'new-login-token', user: newerUser }
      vi.mocked(requestLogout).mockReturnValue(logoutRequest.promise)
      vi.mocked(requestLogin).mockResolvedValue(newerAuthData)
      const store = useAuthStore()
      store.token = authData.token
      store.user = user

      const loggingOut = store.logout()
      await Promise.resolve()
      await store.login(loginPayload)

      if (outcome === 'resolve') {
        logoutRequest.resolve()
        await expect(loggingOut).resolves.toBeUndefined()
      } else {
        const logoutError = new Error('old logout failed')
        logoutRequest.reject(logoutError)
        await expect(loggingOut).rejects.toBe(logoutError)
      }

      expect(writeToken).toHaveBeenCalledExactlyOnceWith(newerAuthData.token)
      expect(clearToken).not.toHaveBeenCalled()
      expect(store.token).toBe(newerAuthData.token)
      expect(store.user).toEqual(newerUser)
      expect(store.isAuthenticated).toBe(true)
    },
  )

  it('lets the latest-started auth attempt win when responses resolve out of order', async () => {
    const olderLogin = deferred<AuthData>()
    const newerUser = { ...user, id: 17, username: 'dana', email: 'dana@example.com' }
    const newerAuthData = { token: 'new-register-token', user: newerUser }
    vi.mocked(requestLogin).mockReturnValue(olderLogin.promise)
    vi.mocked(requestRegister).mockResolvedValue(newerAuthData)
    const store = useAuthStore()

    const loggingIn = store.login(loginPayload)
    await store.register(registerPayload)
    olderLogin.resolve(authData)

    await expect(loggingIn).resolves.toEqual(authData)
    expect(writeToken).toHaveBeenCalledExactlyOnceWith(newerAuthData.token)
    expect(clearToken).not.toHaveBeenCalled()
    expect(store.token).toBe(newerAuthData.token)
    expect(store.user).toEqual(newerUser)
  })

  it('requests logout when authenticated and clears the session', async () => {
    vi.mocked(requestLogout).mockResolvedValue()
    const store = useAuthStore()
    store.token = authData.token
    store.user = user

    await expect(store.logout()).resolves.toBeUndefined()

    expect(advanceSessionEpoch).toHaveBeenCalledOnce()
    expect(requestLogout).toHaveBeenCalledOnce()
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(clearToken).toHaveBeenCalledOnce()
  })

  it('advances the session epoch before a login request settles', async () => {
    const loginRequest = deferred<AuthData>()
    vi.mocked(requestLogin).mockReturnValue(loginRequest.promise)
    const store = useAuthStore()

    const loggingIn = store.login(loginPayload)

    expect(advanceSessionEpoch).toHaveBeenCalledOnce()
    expect(requestLogin).toHaveBeenCalledOnce()

    loginRequest.resolve(authData)
    await loggingIn
  })

  it('clears the session and propagates a logout request failure', async () => {
    const requestError = new Error('network unavailable')
    vi.mocked(requestLogout).mockRejectedValue(requestError)
    const store = useAuthStore()
    store.token = authData.token
    store.user = user

    await expect(store.logout()).rejects.toBe(requestError)

    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(clearToken).toHaveBeenCalledOnce()
  })

  it('skips the logout request when no token exists and still clears local state', async () => {
    const store = useAuthStore()
    store.user = user

    await expect(store.logout()).resolves.toBeUndefined()

    expect(requestLogout).not.toHaveBeenCalled()
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(clearToken).toHaveBeenCalledOnce()
  })
})
