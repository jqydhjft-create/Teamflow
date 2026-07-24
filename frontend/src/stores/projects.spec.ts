import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  CreateProjectPayload,
  JoinProjectPayload,
  Project,
  ProjectListItem,
  ProjectMembership,
} from '@/types/project'

import { createProject, joinProject, listProjects } from '@/api/projects'
import { toApiError } from '@/api/errors'

import { useProjectsStore } from './projects'

vi.mock('@/api/projects', () => ({
  createProject: vi.fn(),
  joinProject: vi.fn(),
  listProjects: vi.fn(),
}))

const firstProject: ProjectListItem = {
  id: 1,
  name: 'Alpha',
  description: 'First project',
  owner_id: 7,
  invite_code: 'ALPHA1',
  created_at: '2026-07-24T08:00:00Z',
  role: 'owner',
}

const secondProject: ProjectListItem = {
  id: 2,
  name: 'Beta',
  description: null,
  owner_id: 8,
  invite_code: 'BETA22',
  created_at: '2026-07-24T09:00:00Z',
  role: 'member',
}

const createdProject: Project = {
  id: 3,
  name: 'Gamma',
  description: 'New project',
  owner_id: 7,
  invite_code: 'GAMMA3',
  created_at: '2026-07-24T10:00:00Z',
}

const createPayload: CreateProjectPayload = {
  name: 'Gamma',
  description: 'New project',
}

const joinPayload: JoinProjectPayload = {
  projectId: 2,
  invite_code: 'BETA22',
}

const membership: ProjectMembership = {
  project_id: 2,
  user_id: 7,
  role: 'member',
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

describe('projects store', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
  })

  it('starts empty, idle, unloaded, and without an error', () => {
    const store = useProjectsStore()

    expect(store.projects).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.loaded).toBe(false)
    expect(store.error).toBeNull()
    expect(store.submitting).toBe(false)
  })

  it('loads projects, marks the list confirmed, and clears an old error', async () => {
    vi.mocked(listProjects).mockResolvedValue([firstProject, secondProject])
    const store = useProjectsStore()
    store.error = toApiError(new Error('old error'))

    await expect(store.loadProjects()).resolves.toBeUndefined()

    expect(listProjects).toHaveBeenCalledOnce()
    expect(store.projects).toEqual([firstProject, secondProject])
    expect(store.loaded).toBe(true)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('swallows an initial load failure, normalizes it, and remains unloaded', async () => {
    const requestError = new Error('initial load failed')
    vi.mocked(listProjects).mockRejectedValue(requestError)
    const store = useProjectsStore()

    await expect(store.loadProjects()).resolves.toBeUndefined()

    expect(store.projects).toEqual([])
    expect(store.loaded).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.error).toEqual(toApiError(requestError))
  })

  it('preserves a confirmed list and loaded state when a forced refresh fails', async () => {
    const refreshError = new Error('refresh failed')
    vi.mocked(listProjects)
      .mockResolvedValueOnce([firstProject])
      .mockRejectedValueOnce(refreshError)
    const store = useProjectsStore()

    await store.loadProjects()
    await expect(store.loadProjects({ force: true })).resolves.toBeUndefined()

    expect(store.projects).toEqual([firstProject])
    expect(store.loaded).toBe(true)
    expect(store.error).toEqual(toApiError(refreshError))
  })

  it('does not request an already confirmed list again without force', async () => {
    vi.mocked(listProjects).mockResolvedValue([firstProject])
    const store = useProjectsStore()

    await store.loadProjects()
    await store.loadProjects()

    expect(listProjects).toHaveBeenCalledOnce()
  })

  it('shares one in-flight request between concurrent non-force loads', async () => {
    const request = deferred<ProjectListItem[]>()
    vi.mocked(listProjects).mockReturnValue(request.promise)
    const store = useProjectsStore()

    const first = store.loadProjects()
    const second = store.loadProjects()

    expect(listProjects).toHaveBeenCalledOnce()
    expect(store.loading).toBe(true)

    request.resolve([firstProject])
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
  })

  it('keeps a newer forced load when an older successful load settles later', async () => {
    const older = deferred<ProjectListItem[]>()
    const newer = deferred<ProjectListItem[]>()
    vi.mocked(listProjects)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    const store = useProjectsStore()

    const olderLoad = store.loadProjects()
    const newerLoad = store.loadProjects({ force: true })
    newer.resolve([secondProject])
    await newerLoad
    older.resolve([firstProject])
    await olderLoad

    expect(store.projects).toEqual([secondProject])
    expect(store.loaded).toBe(true)
    expect(store.error).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('ignores an older failed load after a newer forced load succeeds', async () => {
    const older = deferred<ProjectListItem[]>()
    vi.mocked(listProjects)
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce([secondProject])
    const store = useProjectsStore()

    const olderLoad = store.loadProjects()
    await store.loadProjects({ force: true })
    older.reject(new Error('stale failure'))
    await olderLoad

    expect(store.projects).toEqual([secondProject])
    expect(store.loaded).toBe(true)
    expect(store.error).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('creates a project and prepends an owner item when the list is confirmed', async () => {
    vi.mocked(listProjects).mockResolvedValue([firstProject])
    vi.mocked(createProject).mockResolvedValue(createdProject)
    const store = useProjectsStore()
    await store.loadProjects()

    await expect(store.create(createPayload)).resolves.toEqual(createdProject)

    expect(createProject).toHaveBeenCalledExactlyOnceWith(createPayload)
    expect(store.projects).toEqual([
      { ...createdProject, role: 'owner' },
      firstProject,
    ])
    expect(store.loaded).toBe(true)
    expect(store.error).toBeNull()
    expect(store.submitting).toBe(false)
  })

  it('shares one create mutation, normalizes failure, preserves data, and rethrows the original error', async () => {
    const request = deferred<Project>()
    const requestError = new Error('create failed')
    vi.mocked(createProject).mockReturnValue(request.promise)
    const store = useProjectsStore()
    store.projects = [firstProject]
    store.loaded = true

    const first = store.create(createPayload)
    const second = store.create({ ...createPayload })

    expect(createProject).toHaveBeenCalledExactlyOnceWith(createPayload)
    expect(store.submitting).toBe(true)

    request.reject(requestError)
    const results = await Promise.allSettled([first, second])
    expect(results).toEqual([
      { reason: requestError, status: 'rejected' },
      { reason: requestError, status: 'rejected' },
    ])
    expect(store.projects).toEqual([firstProject])
    expect(store.loaded).toBe(true)
    expect(store.error).toEqual(toApiError(requestError))
    expect(store.submitting).toBe(false)
  })

  it('rejects a different create payload while a create is in progress', async () => {
    const request = deferred<Project>()
    const differentPayload: CreateProjectPayload = {
      name: 'Delta',
      description: null,
    }
    vi.mocked(createProject).mockReturnValue(request.promise)
    const store = useProjectsStore()

    const creating = store.create(createPayload)
    const conflicting = store.create(differentPayload)
    let conflictError: unknown
    void conflicting.catch((error: unknown) => {
      conflictError = error
    })

    await vi.waitFor(() => {
      expect(conflictError).toEqual(new Error('A project mutation is already in progress'))
    })
    expect(createProject).toHaveBeenCalledExactlyOnceWith(createPayload)

    request.resolve(createdProject)
    await expect(creating).resolves.toEqual(createdProject)
  })

  it('does not let a load started before create overwrite the created item', async () => {
    const olderLoad = deferred<ProjectListItem[]>()
    vi.mocked(listProjects).mockReturnValue(olderLoad.promise)
    vi.mocked(createProject).mockResolvedValue(createdProject)
    const store = useProjectsStore()
    store.projects = [firstProject]
    store.loaded = true

    const loading = store.loadProjects({ force: true })
    await store.create(createPayload)
    olderLoad.resolve([secondProject])
    await loading

    expect(store.projects).toEqual([
      { ...createdProject, role: 'owner' },
      firstProject,
    ])
    expect(store.error).toBeNull()
  })

  it('prepends a pending create after a newer forced load and removes a refreshed duplicate', async () => {
    const createRequest = deferred<Project>()
    const refreshedCreatedItem: ProjectListItem = {
      ...createdProject,
      role: 'member',
    }
    vi.mocked(createProject).mockReturnValue(createRequest.promise)
    vi.mocked(listProjects).mockResolvedValue([secondProject, refreshedCreatedItem])
    const store = useProjectsStore()
    store.projects = [firstProject]
    store.loaded = true

    const creating = store.create(createPayload)
    await store.loadProjects({ force: true })

    expect(store.projects).toEqual([secondProject, refreshedCreatedItem])

    createRequest.resolve(createdProject)
    await expect(creating).resolves.toEqual(createdProject)

    expect(store.projects).toEqual([
      { ...createdProject, role: 'owner' },
      secondProject,
    ])
    expect(store.error).toBeNull()
    expect(store.submitting).toBe(false)
  })

  it('publishes a pending create failure after a newer forced load without losing the refreshed list', async () => {
    const createRequest = deferred<Project>()
    const requestError = new Error('late create failed')
    vi.mocked(createProject).mockReturnValue(createRequest.promise)
    vi.mocked(listProjects).mockResolvedValue([secondProject])
    const store = useProjectsStore()
    store.projects = [firstProject]
    store.loaded = true

    const creating = store.create(createPayload)
    await store.loadProjects({ force: true })
    createRequest.reject(requestError)

    await expect(creating).rejects.toBe(requestError)
    expect(store.projects).toEqual([secondProject])
    expect(store.loaded).toBe(true)
    expect(store.error).toEqual(toApiError(requestError))
    expect(store.submitting).toBe(false)
  })

  it('keeps a created owner item when an already pending forced load returns an old snapshot', async () => {
    const createRequest = deferred<Project>()
    const loadRequest = deferred<ProjectListItem[]>()
    vi.mocked(createProject).mockReturnValue(createRequest.promise)
    vi.mocked(listProjects).mockReturnValue(loadRequest.promise)
    const store = useProjectsStore()
    store.projects = [firstProject]
    store.loaded = true

    const creating = store.create(createPayload)
    const loading = store.loadProjects({ force: true })

    createRequest.resolve(createdProject)
    await expect(creating).resolves.toEqual(createdProject)
    expect(store.projects).toEqual([
      { ...createdProject, role: 'owner' },
      firstProject,
    ])

    loadRequest.resolve([firstProject])
    await loading

    expect(store.projects).toEqual([
      { ...createdProject, role: 'owner' },
      firstProject,
    ])
    expect(store.error).toBeNull()
  })

  it('joins with the exact payload, force reloads, and returns the project id', async () => {
    vi.mocked(joinProject).mockResolvedValue(membership)
    vi.mocked(listProjects).mockResolvedValue([secondProject])
    const store = useProjectsStore()

    await expect(store.join(joinPayload)).resolves.toBe(joinPayload.projectId)

    expect(joinProject).toHaveBeenCalledExactlyOnceWith(joinPayload)
    expect(listProjects).toHaveBeenCalledOnce()
    expect(store.projects).toEqual([secondProject])
    expect(store.loaded).toBe(true)
    expect(store.error).toBeNull()
    expect(store.submitting).toBe(false)
  })

  it('shares a pending join for a field-equal payload', async () => {
    const request = deferred<ProjectMembership>()
    vi.mocked(joinProject).mockReturnValue(request.promise)
    vi.mocked(listProjects).mockResolvedValue([secondProject])
    const store = useProjectsStore()

    const first = store.join(joinPayload)
    const second = store.join({ ...joinPayload })

    expect(joinProject).toHaveBeenCalledExactlyOnceWith(joinPayload)
    request.resolve(membership)

    await expect(Promise.all([first, second])).resolves.toEqual([
      joinPayload.projectId,
      joinPayload.projectId,
    ])
    expect(listProjects).toHaveBeenCalledOnce()
  })

  it.each([
    ['project id', { ...joinPayload, projectId: 9 }],
    ['invite code', { ...joinPayload, invite_code: 'OTHER9' }],
  ] as const)('rejects a join with a different %s while a join is in progress', async (_field, differentPayload) => {
    const request = deferred<ProjectMembership>()
    vi.mocked(joinProject).mockReturnValue(request.promise)
    vi.mocked(listProjects).mockResolvedValue([secondProject])
    const store = useProjectsStore()

    const joining = store.join(joinPayload)
    const conflicting = store.join(differentPayload)
    let conflictError: unknown
    void conflicting.catch((error: unknown) => {
      conflictError = error
    })

    await vi.waitFor(() => {
      expect(conflictError).toEqual(new Error('A project mutation is already in progress'))
    })
    expect(joinProject).toHaveBeenCalledExactlyOnceWith(joinPayload)

    request.resolve(membership)
    await expect(joining).resolves.toBe(joinPayload.projectId)
  })

  it('rejects join while create is in progress', async () => {
    const request = deferred<Project>()
    vi.mocked(createProject).mockReturnValue(request.promise)
    const store = useProjectsStore()

    const creating = store.create(createPayload)

    await expect(store.join(joinPayload)).rejects.toThrow('A project mutation is already in progress')
    expect(joinProject).not.toHaveBeenCalled()

    request.resolve(createdProject)
    await expect(creating).resolves.toEqual(createdProject)
  })

  it('rejects create while join is in progress', async () => {
    const request = deferred<ProjectMembership>()
    vi.mocked(joinProject).mockReturnValue(request.promise)
    vi.mocked(listProjects).mockResolvedValue([secondProject])
    const store = useProjectsStore()

    const joining = store.join(joinPayload)

    await expect(store.create(createPayload)).rejects.toThrow('A project mutation is already in progress')
    expect(createProject).not.toHaveBeenCalled()

    request.resolve(membership)
    await expect(joining).resolves.toBe(joinPayload.projectId)
  })

  it('returns the joined project id when the confirming refresh fails', async () => {
    const refreshError = new Error('joined list refresh failed')
    vi.mocked(joinProject).mockResolvedValue(membership)
    vi.mocked(listProjects).mockRejectedValue(refreshError)
    const store = useProjectsStore()

    await expect(store.join(joinPayload)).resolves.toBe(joinPayload.projectId)

    expect(joinProject).toHaveBeenCalledExactlyOnceWith(joinPayload)
    expect(listProjects).toHaveBeenCalledOnce()
    expect(store.loaded).toBe(false)
    expect(store.error).toEqual(toApiError(refreshError))
    expect(store.submitting).toBe(false)
  })

  it('normalizes and rethrows a join request failure without refreshing', async () => {
    const requestError = new Error('join failed')
    vi.mocked(joinProject).mockRejectedValue(requestError)
    const store = useProjectsStore()
    store.projects = [firstProject]
    store.loaded = true

    await expect(store.join(joinPayload)).rejects.toBe(requestError)

    expect(listProjects).not.toHaveBeenCalled()
    expect(store.projects).toEqual([firstProject])
    expect(store.loaded).toBe(true)
    expect(store.error).toEqual(toApiError(requestError))
    expect(store.submitting).toBe(false)
  })

  it('invalidates a pre-join load so it cannot overwrite the forced confirming refresh', async () => {
    const olderLoad = deferred<ProjectListItem[]>()
    vi.mocked(listProjects)
      .mockReturnValueOnce(olderLoad.promise)
      .mockResolvedValueOnce([secondProject])
    vi.mocked(joinProject).mockResolvedValue(membership)
    const store = useProjectsStore()

    const loading = store.loadProjects()
    await store.join(joinPayload)
    olderLoad.resolve([firstProject])
    await loading

    expect(store.projects).toEqual([secondProject])
    expect(store.error).toBeNull()
  })

  it('reset clears state and ignores a late load response', async () => {
    const request = deferred<ProjectListItem[]>()
    vi.mocked(listProjects).mockReturnValue(request.promise)
    const store = useProjectsStore()
    store.projects = [firstProject]
    store.loaded = true
    store.error = toApiError(new Error('old error'))

    const loading = store.loadProjects({ force: true })
    store.reset()

    expect(store.projects).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.loaded).toBe(false)
    expect(store.error).toBeNull()
    expect(store.submitting).toBe(false)

    request.resolve([secondProject])
    await loading
    expect(store.projects).toEqual([])
    expect(store.loaded).toBe(false)
    expect(store.error).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('reset ignores a late mutation success and its finally block', async () => {
    const request = deferred<Project>()
    vi.mocked(createProject).mockReturnValue(request.promise)
    const store = useProjectsStore()
    store.projects = [firstProject]
    store.loaded = true

    const creating = store.create(createPayload)
    store.reset()
    request.resolve(createdProject)

    await expect(creating).resolves.toEqual(createdProject)
    expect(store.projects).toEqual([])
    expect(store.loaded).toBe(false)
    expect(store.error).toBeNull()
    expect(store.submitting).toBe(false)
  })

  it('does not let an old create finally clear a new operation started after reset', async () => {
    const oldRequest = deferred<Project>()
    const newRequest = deferred<Project>()
    const newerProject: Project = {
      ...createdProject,
      id: 4,
      name: 'Delta',
      invite_code: 'DELTA4',
    }
    const newerPayload: CreateProjectPayload = {
      name: 'Delta',
      description: createdProject.description,
    }
    vi.mocked(createProject)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise)
    const store = useProjectsStore()

    const oldCreating = store.create(createPayload)
    store.reset()
    const newCreating = store.create(newerPayload)

    oldRequest.resolve(createdProject)
    await oldCreating

    expect(store.submitting).toBe(true)
    const sharedNewCreating = store.create({ ...newerPayload })
    expect(createProject).toHaveBeenCalledTimes(2)

    newRequest.resolve(newerProject)
    await expect(Promise.all([newCreating, sharedNewCreating])).resolves.toEqual([
      newerProject,
      newerProject,
    ])
    expect(store.submitting).toBe(false)
  })
})
