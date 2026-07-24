import { AxiosError } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Project, ProjectMember } from '@/types/project'
import type { Task, TaskFilters, TaskPayload } from '@/types/task'

import { toApiError } from '@/api/errors'
import { getProject, listProjectMembers } from '@/api/projects'
import {
  createTask as requestCreateTask,
  deleteTask as requestDeleteTask,
  listTasks,
  updateTaskOrder,
  updateTask as requestUpdateTask,
} from '@/api/tasks'

import { useBoardStore } from './board'

vi.mock('@/api/projects', () => ({
  getProject: vi.fn(),
  listProjectMembers: vi.fn(),
}))

vi.mock('@/api/tasks', () => ({
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  listTasks: vi.fn(),
  updateTaskOrder: vi.fn(),
  updateTask: vi.fn(),
}))

const projectOne: Project = {
  id: 1,
  name: 'Alpha',
  description: 'First project',
  owner_id: 7,
  invite_code: 'ALPHA1',
  created_at: '2026-07-24T08:00:00Z',
}

const projectTwo: Project = {
  ...projectOne,
  id: 2,
  name: 'Beta',
  invite_code: 'BETA22',
}

const membersOne: ProjectMember[] = [
  { user_id: 7, username: 'owner', email: 'owner@example.com', role: 'owner' },
  { user_id: 8, username: 'member', email: 'member@example.com', role: 'member' },
]

const taskOne: Task = {
  id: 11,
  project_id: 1,
  title: 'First task',
  description: null,
  status: 'todo',
  priority: 'medium',
  assignee_id: 7,
  sort_order: 2,
  comment_count: 0,
  created_at: '2026-07-24T08:30:00Z',
}

const taskTwo: Task = {
  ...taskOne,
  id: 12,
  title: 'Second task',
  status: 'in_progress',
  priority: 'high',
  assignee_id: 8,
  sort_order: 1,
}

const taskPayload: TaskPayload = {
  title: 'Confirmed task',
  description: null,
  status: 'todo',
  priority: 'low',
  assignee_id: null,
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

function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function httpError(status: number): AxiosError {
  return new AxiosError(
    `HTTP ${status}`,
    undefined,
    undefined,
    undefined,
    {
      status,
      statusText: String(status),
      headers: {},
      config: { headers: {} } as never,
      data: {},
    },
  )
}

function seedLoadedStore() {
  const store = useBoardStore()
  store.currentProjectId = projectOne.id
  store.project = projectOne
  store.members = membersOne
  store.tasks = [taskOne, taskTwo]
  store.loaded = true
  return store
}

describe('board store', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
  })

  it('starts with an empty idle board and initialized ordering state', () => {
    const store = useBoardStore()

    expect(store.currentProjectId).toBeNull()
    expect(store.project).toBeNull()
    expect(store.members).toEqual([])
    expect(store.tasks).toEqual([])
    expect(store.filters).toEqual({ priority: undefined, assignee_id: undefined })
    expect(store.loading).toBe(false)
    expect(store.loaded).toBe(false)
    expect(store.errorKind).toBeNull()
    expect(store.taskSubmitting).toBe(false)
    expect(store.ordering).toBe(false)
    expect(store.orderingError).toBeNull()
  })

  it('starts project detail, members, and unfiltered tasks in parallel and commits atomically', async () => {
    const projectRequest = deferred<Project>()
    const membersRequest = deferred<ProjectMember[]>()
    const tasksRequest = deferred<Task[]>()
    vi.mocked(getProject).mockReturnValue(projectRequest.promise)
    vi.mocked(listProjectMembers).mockReturnValue(membersRequest.promise)
    vi.mocked(listTasks).mockReturnValue(tasksRequest.promise)
    const store = useBoardStore()

    const loading = store.loadProject(1)

    expect(getProject).toHaveBeenCalledExactlyOnceWith(1)
    expect(listProjectMembers).toHaveBeenCalledExactlyOnceWith(1)
    expect(listTasks).toHaveBeenCalledExactlyOnceWith(1, undefined)
    expect(store.loading).toBe(true)
    expect(store.project).toBeNull()
    expect(store.members).toEqual([])
    expect(store.tasks).toEqual([])

    projectRequest.resolve(projectOne)
    membersRequest.resolve(membersOne)
    await Promise.resolve()
    expect(store.project).toBeNull()
    expect(store.members).toEqual([])

    tasksRequest.resolve([taskOne, taskTwo])
    await expect(loading).resolves.toBeUndefined()
    expect(store.project).toEqual(projectOne)
    expect(store.members).toEqual(membersOne)
    expect(store.tasks).toEqual([taskOne, taskTwo])
    expect(store.loaded).toBe(true)
    expect(store.loading).toBe(false)
  })

  it('shares the in-flight promise for a repeated load of the same project', async () => {
    const projectRequest = deferred<Project>()
    vi.mocked(getProject).mockReturnValue(projectRequest.promise)
    vi.mocked(listProjectMembers).mockResolvedValue(membersOne)
    vi.mocked(listTasks).mockResolvedValue([taskOne])
    const store = useBoardStore()

    const first = store.loadProject(1)
    const second = store.loadProject(1)

    expect(getProject).toHaveBeenCalledOnce()
    expect(listProjectMembers).toHaveBeenCalledOnce()
    expect(listTasks).toHaveBeenCalledOnce()

    projectRequest.resolve(projectOne)
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
  })

  it('rejects invalid project ids without changing state or requesting APIs', async () => {
    const store = seedLoadedStore()

    await expect(store.loadProject(0)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))

    expect(getProject).not.toHaveBeenCalled()
    expect(listProjectMembers).not.toHaveBeenCalled()
    expect(listTasks).not.toHaveBeenCalled()
    expect(store.currentProjectId).toBe(1)
    expect(store.project).toEqual(projectOne)
  })

  it('rejects create, update, and delete while the base project load is pending', async () => {
    const projectRequest = deferred<Project>()
    const membersRequest = deferred<ProjectMember[]>()
    const tasksRequest = deferred<Task[]>()
    vi.mocked(getProject).mockReturnValue(projectRequest.promise)
    vi.mocked(listProjectMembers).mockReturnValue(membersRequest.promise)
    vi.mocked(listTasks).mockReturnValue(tasksRequest.promise)
    const store = useBoardStore()

    const loading = store.loadProject(1)
    const snapshot = {
      filters: { ...store.filters },
      loading: store.loading,
      tasks: [...store.tasks],
    }

    await expect(store.createTask(taskPayload)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    await expect(store.updateTask(taskOne.id, taskPayload)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    await expect(store.deleteTask(taskOne.id)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    expect(requestCreateTask).not.toHaveBeenCalled()
    expect(requestUpdateTask).not.toHaveBeenCalled()
    expect(requestDeleteTask).not.toHaveBeenCalled()
    expect(store.filters).toEqual(snapshot.filters)
    expect(store.loading).toBe(snapshot.loading)
    expect(store.tasks).toEqual(snapshot.tasks)
    expect(store.taskSubmitting).toBe(false)

    projectRequest.resolve(projectOne)
    membersRequest.resolve(membersOne)
    tasksRequest.resolve([taskOne, taskTwo])
    await loading
  })

  it('clears the old project immediately and ignores every settlement path from the stale load', async () => {
    const oldProject = deferred<Project>()
    const oldMembers = deferred<ProjectMember[]>()
    const oldTasks = deferred<Task[]>()
    const newProject = deferred<Project>()
    const newMembers = deferred<ProjectMember[]>()
    const newTasks = deferred<Task[]>()
    vi.mocked(getProject).mockReturnValueOnce(oldProject.promise).mockReturnValueOnce(newProject.promise)
    vi.mocked(listProjectMembers).mockReturnValueOnce(oldMembers.promise).mockReturnValueOnce(newMembers.promise)
    vi.mocked(listTasks).mockReturnValueOnce(oldTasks.promise).mockReturnValueOnce(newTasks.promise)
    const store = seedLoadedStore()
    store.filters = { priority: 'high', assignee_id: 8 }

    const loadingOld = store.loadProject(1)
    const loadingNew = store.loadProject(2)

    expect(store.currentProjectId).toBe(2)
    expect(store.project).toBeNull()
    expect(store.members).toEqual([])
    expect(store.tasks).toEqual([])
    expect(store.filters).toEqual({ priority: undefined, assignee_id: undefined })
    expect(store.loaded).toBe(false)
    expect(store.loading).toBe(true)

    oldProject.resolve(projectOne)
    oldMembers.reject(httpError(403))
    oldTasks.resolve([taskOne])
    await loadingOld
    expect(store.currentProjectId).toBe(2)
    expect(store.errorKind).toBeNull()
    expect(store.loading).toBe(true)

    newProject.resolve(projectTwo)
    newMembers.resolve([])
    newTasks.resolve([{ ...taskTwo, project_id: 2 }])
    await loadingNew
    expect(store.project).toEqual(projectTwo)
    expect(store.tasks).toEqual([{ ...taskTwo, project_id: 2 }])
    expect(store.loading).toBe(false)
  })

  it.each([
    [403, 'forbidden'],
    [404, 'not_found'],
    [500, 'load'],
  ] as const)('classifies a %s load failure without committing partial data', async (status, kind) => {
    vi.mocked(getProject).mockResolvedValue(projectOne)
    vi.mocked(listProjectMembers).mockResolvedValue(membersOne)
    vi.mocked(listTasks).mockRejectedValue(httpError(status))
    const store = useBoardStore()

    await expect(store.loadProject(1)).resolves.toBeUndefined()

    expect(store.project).toBeNull()
    expect(store.members).toEqual([])
    expect(store.tasks).toEqual([])
    expect(store.loaded).toBe(false)
    expect(store.errorKind).toBe(kind)
    expect(store.loading).toBe(false)
  })

  it('groups copies of tasks by status using sort order and id without mutating source order', () => {
    const store = useBoardStore()
    const lowId = { ...taskOne, id: 10, sort_order: 1 }
    const highId = { ...taskOne, id: 20, sort_order: 1 }
    const later = { ...taskOne, id: 5, sort_order: 3 }
    store.tasks = [later, highId, taskTwo, lowId]

    expect(store.columns.todo.map(task => task.id)).toEqual([10, 20, 5])
    expect(store.columns.in_progress.map(task => task.id)).toEqual([12])
    expect(store.columns.done).toEqual([])
    expect(store.tasks.map(task => task.id)).toEqual([5, 20, 12, 10])
  })

  it('indexes members and derives active filters and drag availability', () => {
    const store = useBoardStore()
    store.members = membersOne

    expect(store.memberById.get(8)).toEqual(membersOne[1])
    expect(store.filtersActive).toBe(false)
    expect(store.dragDisabled).toBe(false)

    store.filters = { priority: undefined, assignee_id: 0 }
    expect(store.filtersActive).toBe(false)
    store.filters = { priority: 'high', assignee_id: undefined }
    expect(store.filtersActive).toBe(true)
    expect(store.dragDisabled).toBe(true)

    store.filters = { priority: undefined, assignee_id: undefined }
    store.loading = true
    expect(store.dragDisabled).toBe(true)
    store.loading = false
    store.taskSubmitting = true
    expect(store.dragDisabled).toBe(true)
    store.taskSubmitting = false
    store.ordering = true
    expect(store.dragDisabled).toBe(true)
  })

  it('normalizes filters, sends only active values, and replaces only tasks', async () => {
    vi.mocked(listTasks).mockResolvedValue([taskTwo])
    const store = seedLoadedStore()
    const projectBefore = store.project
    const membersBefore = store.members
    const filters: TaskFilters = { priority: 'high' }

    await store.applyFilters(filters)

    expect(listTasks).toHaveBeenCalledExactlyOnceWith(1, { priority: 'high' })
    expect(store.filters).toEqual({ priority: 'high', assignee_id: undefined })
    expect(store.tasks).toEqual([taskTwo])
    expect(store.project).toBe(projectBefore)
    expect(store.members).toBe(membersBefore)

    vi.mocked(listTasks).mockResolvedValue([taskOne])
    await store.applyFilters()
    expect(listTasks).toHaveBeenLastCalledWith(1, undefined)
    expect(store.filters).toEqual({ priority: undefined, assignee_id: undefined })
  })

  it('fails fast when filtering without a project or with an invalid assignee', async () => {
    const store = useBoardStore()

    await expect(store.applyFilters({ priority: 'low' })).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    store.currentProjectId = 1
    await expect(store.applyFilters({ assignee_id: 0 })).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    expect(listTasks).not.toHaveBeenCalled()
  })

  it('lets only the newest filter success, failure, and finally affect the board', async () => {
    const older = deferred<Task[]>()
    const newer = deferred<Task[]>()
    vi.mocked(listTasks).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const store = seedLoadedStore()

    const oldFiltering = store.applyFilters({ priority: 'low' })
    const newFiltering = store.applyFilters({ priority: 'high' })
    older.reject(httpError(403))
    await expect(oldFiltering).rejects.toEqual(toApiError(httpError(403)))
    expect(store.tasks).toEqual([taskOne, taskTwo])
    expect(store.filters).toEqual({ priority: 'high', assignee_id: undefined })
    expect(store.loading).toBe(true)
    expect(store.errorKind).toBeNull()

    newer.resolve([taskTwo])
    await newFiltering
    expect(store.tasks).toEqual([taskTwo])
    expect(store.loading).toBe(false)
  })

  it('preserves confirmed tasks and page-level error state when the current filter fails', async () => {
    const requestError = httpError(404)
    vi.mocked(listTasks).mockRejectedValue(requestError)
    const store = seedLoadedStore()

    await expect(store.applyFilters({ priority: 'high' })).rejects.toEqual(toApiError(requestError))

    expect(store.tasks).toEqual([taskOne, taskTwo])
    expect(store.errorKind).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('rejects all CRUD operations without side effects while a filter request is pending', async () => {
    const filterRequest = deferred<Task[]>()
    vi.mocked(listTasks).mockReturnValue(filterRequest.promise)
    const store = seedLoadedStore()

    const filtering = store.applyFilters({ priority: 'high' })
    const snapshot = {
      filters: { ...store.filters },
      loading: store.loading,
      tasks: [...store.tasks],
    }

    await expect(store.createTask(taskPayload)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    await expect(store.updateTask(taskOne.id, taskPayload)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    await expect(store.deleteTask(taskOne.id)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    expect(requestCreateTask).not.toHaveBeenCalled()
    expect(requestUpdateTask).not.toHaveBeenCalled()
    expect(requestDeleteTask).not.toHaveBeenCalled()
    expect(store.filters).toEqual(snapshot.filters)
    expect(store.loading).toBe(snapshot.loading)
    expect(store.tasks).toEqual(snapshot.tasks)
    expect(store.taskSubmitting).toBe(false)

    filterRequest.resolve([taskTwo])
    await filtering
  })

  it('rejects filtering without side effects while a mutation is pending', async () => {
    const createRequest = deferred<Task>()
    vi.mocked(requestCreateTask).mockReturnValue(createRequest.promise)
    const store = seedLoadedStore()
    const creating = store.createTask(taskPayload)
    const snapshot = {
      filters: { ...store.filters },
      loading: store.loading,
      tasks: [...store.tasks],
    }

    await expect(store.applyFilters({ priority: 'high' })).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    expect(listTasks).not.toHaveBeenCalled()
    expect(store.filters).toEqual(snapshot.filters)
    expect(store.loading).toBe(snapshot.loading)
    expect(store.tasks).toEqual(snapshot.tasks)
    expect(store.taskSubmitting).toBe(true)

    createRequest.resolve({ ...taskOne, id: 30 })
    await creating
  })

  it('rejects a same-project reload without side effects while a mutation is pending', async () => {
    const createRequest = deferred<Task>()
    vi.mocked(requestCreateTask).mockReturnValue(createRequest.promise)
    const store = seedLoadedStore()
    const creating = store.createTask(taskPayload)
    const snapshot = {
      filters: { ...store.filters },
      loading: store.loading,
      tasks: [...store.tasks],
    }

    await expect(store.loadProject(1)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    expect(getProject).not.toHaveBeenCalled()
    expect(listProjectMembers).not.toHaveBeenCalled()
    expect(listTasks).not.toHaveBeenCalled()
    expect(store.filters).toEqual(snapshot.filters)
    expect(store.loading).toBe(snapshot.loading)
    expect(store.tasks).toEqual(snapshot.tasks)
    expect(store.taskSubmitting).toBe(true)

    createRequest.resolve({ ...taskOne, id: 30 })
    await creating
  })

  it('treats ordering as a mutex for filters, mutations, and same-project reloads', async () => {
    const store = seedLoadedStore()
    store.ordering = true
    const snapshot = {
      filters: { ...store.filters },
      loading: store.loading,
      tasks: [...store.tasks],
    }

    await expect(store.applyFilters({ priority: 'high' })).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    await expect(store.createTask(taskPayload)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    await expect(store.updateTask(taskOne.id, taskPayload)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    await expect(store.deleteTask(taskOne.id)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    await expect(store.loadProject(1)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    expect(listTasks).not.toHaveBeenCalled()
    expect(requestCreateTask).not.toHaveBeenCalled()
    expect(requestUpdateTask).not.toHaveBeenCalled()
    expect(requestDeleteTask).not.toHaveBeenCalled()
    expect(getProject).not.toHaveBeenCalled()
    expect(store.filters).toEqual(snapshot.filters)
    expect(store.loading).toBe(snapshot.loading)
    expect(store.tasks).toEqual(snapshot.tasks)
    expect(store.taskSubmitting).toBe(false)
    expect(store.ordering).toBe(true)
  })

  it('waits for the atomic base load before requesting filters and owns loading until filtering finishes', async () => {
    const projectRequest = deferred<Project>()
    const membersRequest = deferred<ProjectMember[]>()
    const baseTasksRequest = deferred<Task[]>()
    const filteredTasksRequest = deferred<Task[]>()
    vi.mocked(getProject).mockReturnValue(projectRequest.promise)
    vi.mocked(listProjectMembers).mockReturnValue(membersRequest.promise)
    vi.mocked(listTasks)
      .mockReturnValueOnce(baseTasksRequest.promise)
      .mockReturnValueOnce(filteredTasksRequest.promise)
    const store = useBoardStore()

    const loading = store.loadProject(1)
    const filtering = store.applyFilters({ priority: 'high' })

    expect(listTasks).toHaveBeenCalledExactlyOnceWith(1, undefined)
    expect(store.loading).toBe(true)
    expect(store.dragDisabled).toBe(true)

    projectRequest.resolve(projectOne)
    membersRequest.resolve(membersOne)
    baseTasksRequest.resolve([taskOne, taskTwo])
    await loading

    expect(listTasks).toHaveBeenCalledTimes(2)
    expect(listTasks).toHaveBeenLastCalledWith(1, { priority: 'high' })
    expect(store.tasks).toEqual([taskOne, taskTwo])
    expect(store.loading).toBe(true)
    expect(store.dragDisabled).toBe(true)

    filteredTasksRequest.resolve([taskTwo])
    await filtering
    expect(store.filters).toEqual({ priority: 'high', assignee_id: undefined })
    expect(store.tasks).toEqual([taskTwo])
    expect(store.loading).toBe(false)
    expect(store.dragDisabled).toBe(true)
  })

  it('rejects a filter waiting on a failed base load without sending another task request', async () => {
    const requestError = httpError(403)
    const projectRequest = deferred<Project>()
    const membersRequest = deferred<ProjectMember[]>()
    const baseTasksRequest = deferred<Task[]>()
    vi.mocked(getProject).mockReturnValue(projectRequest.promise)
    vi.mocked(listProjectMembers).mockReturnValue(membersRequest.promise)
    vi.mocked(listTasks).mockReturnValue(baseTasksRequest.promise)
    const store = useBoardStore()

    const loading = store.loadProject(1)
    const filtering = store.applyFilters({ priority: 'high' })
    projectRequest.resolve(projectOne)
    membersRequest.resolve(membersOne)
    baseTasksRequest.reject(requestError)

    await loading
    await expect(filtering).rejects.toEqual(toApiError(requestError))
    expect(listTasks).toHaveBeenCalledExactlyOnceWith(1, undefined)
    expect(store.errorKind).toBe('forbidden')
    expect(store.project).toBeNull()
    expect(store.tasks).toEqual([])
    expect(store.loading).toBe(false)
  })

  it('skips superseded filters waiting on a base load and requests only the latest filters', async () => {
    const projectRequest = deferred<Project>()
    const membersRequest = deferred<ProjectMember[]>()
    const baseTasksRequest = deferred<Task[]>()
    const latestTasksRequest = deferred<Task[]>()
    vi.mocked(getProject).mockReturnValue(projectRequest.promise)
    vi.mocked(listProjectMembers).mockReturnValue(membersRequest.promise)
    vi.mocked(listTasks)
      .mockReturnValueOnce(baseTasksRequest.promise)
      .mockReturnValueOnce(latestTasksRequest.promise)
    const store = useBoardStore()

    const loading = store.loadProject(1)
    const highFiltering = store.applyFilters({ priority: 'high' })
    const lowFiltering = store.applyFilters({ priority: 'low' })
    projectRequest.resolve(projectOne)
    membersRequest.resolve(membersOne)
    baseTasksRequest.resolve([taskOne, taskTwo])

    await loading
    await highFiltering
    expect(listTasks).toHaveBeenCalledTimes(2)
    expect(listTasks).toHaveBeenLastCalledWith(1, { priority: 'low' })
    expect(store.loading).toBe(true)

    latestTasksRequest.resolve([taskOne])
    await lowFiltering
    expect(store.filters).toEqual({ priority: 'low', assignee_id: undefined })
    expect(store.tasks).toEqual([taskOne])
    expect(store.loading).toBe(false)
  })

  it.each(['success', 'failure'] as const)(
    'project switching ignores an old in-flight filter %s and its finally block',
    async (settlement) => {
      const oldFilterRequest = deferred<Task[]>()
      const newProjectRequest = deferred<Project>()
      const newMembersRequest = deferred<ProjectMember[]>()
      const newTasksRequest = deferred<Task[]>()
      vi.mocked(listTasks)
        .mockReturnValueOnce(oldFilterRequest.promise)
        .mockReturnValueOnce(newTasksRequest.promise)
      vi.mocked(getProject).mockReturnValue(newProjectRequest.promise)
      vi.mocked(listProjectMembers).mockReturnValue(newMembersRequest.promise)
      const store = seedLoadedStore()

      const filtering = store.applyFilters({ priority: 'high' })
      const filterResult = filtering.then(
        () => null,
        (error: unknown) => error,
      )
      const loadingNew = store.loadProject(2)

      if (settlement === 'success') {
        oldFilterRequest.resolve([taskTwo])
      }
      else {
        oldFilterRequest.reject(httpError(404))
      }
      const filterError = await filterResult

      if (settlement === 'failure') {
        expect(filterError).toEqual(toApiError(httpError(404)))
      }
      expect(store.currentProjectId).toBe(2)
      expect(store.project).toBeNull()
      expect(store.tasks).toEqual([])
      expect(store.errorKind).toBeNull()
      expect(store.loading).toBe(true)

      newProjectRequest.resolve(projectTwo)
      newMembersRequest.resolve([])
      newTasksRequest.resolve([{ ...taskTwo, project_id: 2 }])
      await loadingNew
      expect(store.project).toEqual(projectTwo)
      expect(store.tasks).toEqual([{ ...taskTwo, project_id: 2 }])
      expect(store.loading).toBe(false)
    },
  )

  it('inserts or replaces a created task by id and returns the confirmed task', async () => {
    const created = { ...taskOne, id: 30, title: taskPayload.title }
    const refreshed = { ...created, title: 'Server refreshed title' }
    vi.mocked(requestCreateTask).mockResolvedValueOnce(created).mockResolvedValueOnce(refreshed)
    const store = seedLoadedStore()

    await expect(store.createTask(taskPayload)).resolves.toEqual(created)
    expect(requestCreateTask).toHaveBeenCalledExactlyOnceWith(1, taskPayload)
    expect(store.tasks).toEqual([taskOne, taskTwo, created])

    await expect(store.createTask(taskPayload)).resolves.toEqual(refreshed)
    expect(store.tasks).toEqual([taskOne, taskTwo, refreshed])
    expect(store.tasks.filter(task => task.id === created.id)).toHaveLength(1)
    expect(store.taskSubmitting).toBe(false)
  })

  it('projects created tasks through active priority and assignee filters', async () => {
    const priorityMatch = { ...taskOne, id: 30, priority: 'high' as const, assignee_id: 7 }
    const priorityMiss = { ...taskOne, id: 31, priority: 'low' as const, assignee_id: 8 }
    const combinedAssigneeMiss = { ...taskOne, id: 32, priority: 'high' as const, assignee_id: 7 }
    const combinedMatch = { ...taskOne, id: 33, priority: 'high' as const, assignee_id: 8 }
    vi.mocked(requestCreateTask)
      .mockResolvedValueOnce(priorityMatch)
      .mockResolvedValueOnce(priorityMiss)
      .mockResolvedValueOnce(combinedAssigneeMiss)
      .mockResolvedValueOnce(combinedMatch)
    const store = seedLoadedStore()
    store.tasks = []
    store.filters = { priority: 'high', assignee_id: undefined }

    await store.createTask(taskPayload)
    await store.createTask(taskPayload)
    expect(store.tasks).toEqual([priorityMatch])

    store.tasks = []
    store.filters = { priority: 'high', assignee_id: 8 }
    await store.createTask(taskPayload)
    await store.createTask(taskPayload)
    expect(store.tasks).toEqual([combinedMatch])
  })

  it('removes an updated visible task when it stops matching the active filters', async () => {
    const noLongerMatching = { ...taskTwo, priority: 'low' as const }
    vi.mocked(requestUpdateTask).mockResolvedValue(noLongerMatching)
    const store = seedLoadedStore()
    store.tasks = [taskTwo]
    store.filters = { priority: 'high', assignee_id: undefined }

    await store.updateTask(taskTwo.id, taskPayload)
    expect(store.tasks).toEqual([])
  })

  it('inserts an updated task that becomes visible under the active assignee filter', async () => {
    const newlyMatching = { ...taskOne, assignee_id: 8 }
    vi.mocked(requestUpdateTask).mockResolvedValue(newlyMatching)
    const store = seedLoadedStore()
    store.tasks = []
    store.filters = { priority: undefined, assignee_id: 8 }

    await store.updateTask(taskOne.id, taskPayload)
    expect(store.tasks).toEqual([newlyMatching])
  })

  it('rejects a created task from another project without changing tasks', async () => {
    const crossProjectTask = { ...taskOne, id: 30, project_id: 2 }
    vi.mocked(requestCreateTask).mockResolvedValue(crossProjectTask)
    const store = seedLoadedStore()

    await expect(store.createTask(taskPayload)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    expect(store.tasks).toEqual([taskOne, taskTwo])
    expect(store.taskSubmitting).toBe(false)
  })

  it('moves an updated task between computed columns and rejects an id mismatch without changing tasks', async () => {
    const moved = { ...taskOne, status: 'done' as const }
    vi.mocked(requestUpdateTask).mockResolvedValueOnce(moved).mockResolvedValueOnce({ ...moved, id: 999 })
    const store = seedLoadedStore()

    await expect(store.updateTask(taskOne.id, taskPayload)).resolves.toEqual(moved)
    expect(store.columns.todo).toEqual([])
    expect(store.columns.done).toEqual([moved])
    const confirmed = [...store.tasks]

    await expect(store.updateTask(taskOne.id, taskPayload)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    expect(store.tasks).toEqual(confirmed)
  })

  it('rejects an updated task from another project without changing tasks', async () => {
    const crossProjectTask = { ...taskOne, project_id: 2 }
    vi.mocked(requestUpdateTask).mockResolvedValue(crossProjectTask)
    const store = seedLoadedStore()

    await expect(store.updateTask(taskOne.id, taskPayload)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    expect(store.tasks).toEqual([taskOne, taskTwo])
    expect(store.taskSubmitting).toBe(false)
  })

  it('removes a task only after delete succeeds and retains it on normalized failure', async () => {
    const deletion = deferred<void>()
    vi.mocked(requestDeleteTask).mockReturnValueOnce(deletion.promise)
    const store = seedLoadedStore()

    const deleting = store.deleteTask(taskOne.id)
    expect(store.tasks).toEqual([taskOne, taskTwo])
    deletion.resolve()
    await deleting
    expect(store.tasks).toEqual([taskTwo])

    const requestError = new Error('delete failed')
    vi.mocked(requestDeleteTask).mockRejectedValueOnce(requestError)
    await expect(store.deleteTask(taskTwo.id)).rejects.toEqual(toApiError(requestError))
    expect(store.tasks).toEqual([taskTwo])
  })

  it('rejects invalid task ids and all duplicate mutation types while one mutation is pending', async () => {
    const creation = deferred<Task>()
    vi.mocked(requestCreateTask).mockReturnValue(creation.promise)
    const store = seedLoadedStore()

    await expect(store.updateTask(0, taskPayload)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    await expect(store.deleteTask(Number.MAX_SAFE_INTEGER + 1)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    const creating = store.createTask(taskPayload)

    await expect(store.createTask(taskPayload)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    await expect(store.updateTask(taskOne.id, taskPayload)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    await expect(store.deleteTask(taskOne.id)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
    expect(requestCreateTask).toHaveBeenCalledOnce()
    expect(requestUpdateTask).not.toHaveBeenCalled()
    expect(requestDeleteTask).not.toHaveBeenCalled()

    creation.resolve({ ...taskOne, id: 30 })
    await creating
  })

  it.each(['success', 'failure'] as const)(
    'project switching ignores an old create %s and its finally block',
    async (settlement) => {
      const oldCreateRequest = deferred<Task>()
      const newProjectRequest = deferred<Project>()
      const newMembersRequest = deferred<ProjectMember[]>()
      const newTasksRequest = deferred<Task[]>()
      vi.mocked(requestCreateTask).mockReturnValue(oldCreateRequest.promise)
      vi.mocked(getProject).mockReturnValue(newProjectRequest.promise)
      vi.mocked(listProjectMembers).mockReturnValue(newMembersRequest.promise)
      vi.mocked(listTasks).mockReturnValue(newTasksRequest.promise)
      const store = seedLoadedStore()

      const creating = store.createTask(taskPayload)
      const createResult = creating.then(
        task => task,
        (error: unknown) => error,
      )
      const loadingNew = store.loadProject(2)

      expect(store.taskSubmitting).toBe(false)
      if (settlement === 'success') {
        oldCreateRequest.resolve({ ...taskOne, id: 30 })
      }
      else {
        oldCreateRequest.reject(new Error('old create failed'))
      }
      const createOutcome = await createResult

      if (settlement === 'failure') {
        expect(createOutcome).toEqual(toApiError(new Error('old create failed')))
      }
      expect(store.currentProjectId).toBe(2)
      expect(store.tasks).toEqual([])
      expect(store.taskSubmitting).toBe(false)
      expect(store.loading).toBe(true)

      newProjectRequest.resolve(projectTwo)
      newMembersRequest.resolve([])
      newTasksRequest.resolve([{ ...taskTwo, project_id: 2 }])
      await loadingNew
      expect(store.tasks).toEqual([{ ...taskTwo, project_id: 2 }])
      expect(store.taskSubmitting).toBe(false)
    },
  )

  it('starts a fresh same-project load after reset and ignores the old load and finally block', async () => {
    const oldProject = deferred<Project>()
    const oldMembers = deferred<ProjectMember[]>()
    const oldTasks = deferred<Task[]>()
    const newProject = deferred<Project>()
    const newMembers = deferred<ProjectMember[]>()
    const newTasks = deferred<Task[]>()
    vi.mocked(getProject).mockReturnValueOnce(oldProject.promise).mockReturnValueOnce(newProject.promise)
    vi.mocked(listProjectMembers).mockReturnValueOnce(oldMembers.promise).mockReturnValueOnce(newMembers.promise)
    vi.mocked(listTasks).mockReturnValueOnce(oldTasks.promise).mockReturnValueOnce(newTasks.promise)
    const store = useBoardStore()

    const oldLoading = store.loadProject(1)
    store.reset()
    const newLoading = store.loadProject(1)

    expect(getProject).toHaveBeenCalledTimes(2)
    expect(listProjectMembers).toHaveBeenCalledTimes(2)
    expect(listTasks).toHaveBeenCalledTimes(2)

    oldProject.resolve(projectOne)
    oldMembers.resolve(membersOne)
    oldTasks.resolve([taskOne])
    await oldLoading
    expect(store.loading).toBe(true)
    expect(store.project).toBeNull()
    expect(store.tasks).toEqual([])

    newProject.resolve(projectOne)
    newMembers.resolve(membersOne)
    newTasks.resolve([taskTwo])
    await newLoading
    expect(store.project).toEqual(projectOne)
    expect(store.tasks).toEqual([taskTwo])
    expect(store.loading).toBe(false)
  })

  it('normalizes a create failure, preserves tasks, and releases the mutation lock', async () => {
    const requestError = new Error('create failed')
    vi.mocked(requestCreateTask).mockRejectedValue(requestError)
    const store = seedLoadedStore()

    await expect(store.createTask(taskPayload)).rejects.toEqual(toApiError(requestError))
    expect(store.tasks).toEqual([taskOne, taskTwo])
    expect(store.taskSubmitting).toBe(false)
  })

  it('normalizes an update failure, preserves tasks, and releases the mutation lock', async () => {
    const requestError = new Error('update failed')
    vi.mocked(requestUpdateTask).mockRejectedValue(requestError)
    const store = seedLoadedStore()

    await expect(store.updateTask(taskOne.id, taskPayload)).rejects.toEqual(toApiError(requestError))
    expect(store.tasks).toEqual([taskOne, taskTwo])
    expect(store.taskSubmitting).toBe(false)
  })

  it('reset clears all state and prevents late load, filter, mutation, and finally blocks from affecting a new operation', async () => {
    const oldProject = deferred<Project>()
    const oldMembers = deferred<ProjectMember[]>()
    const oldTasks = deferred<Task[]>()
    vi.mocked(getProject).mockReturnValue(oldProject.promise)
    vi.mocked(listProjectMembers).mockReturnValue(oldMembers.promise)
    vi.mocked(listTasks).mockReturnValue(oldTasks.promise)
    const store = seedLoadedStore()

    const loading = store.loadProject(1)
    const filtering = store.applyFilters({ priority: 'high' })
    store.ordering = true
    store.orderingError = toApiError(new Error('ordering'))
    store.reset()

    expect(store.currentProjectId).toBeNull()
    expect(store.project).toBeNull()
    expect(store.members).toEqual([])
    expect(store.tasks).toEqual([])
    expect(store.filters).toEqual({ priority: undefined, assignee_id: undefined })
    expect(store.loading).toBe(false)
    expect(store.loaded).toBe(false)
    expect(store.errorKind).toBeNull()
    expect(store.taskSubmitting).toBe(false)
    expect(store.ordering).toBe(false)
    expect(store.orderingError).toBeNull()

    const newProject = deferred<Project>()
    vi.mocked(getProject).mockReturnValueOnce(newProject.promise)
    vi.mocked(listProjectMembers).mockResolvedValueOnce([])
    vi.mocked(listTasks).mockResolvedValueOnce([])
    const newLoading = store.loadProject(2)

    oldProject.resolve(projectOne)
    oldMembers.resolve(membersOne)
    oldTasks.resolve([taskOne])
    await Promise.all([loading, filtering])
    expect(store.currentProjectId).toBe(2)
    expect(store.loading).toBe(true)
    expect(store.taskSubmitting).toBe(false)

    newProject.resolve(projectTwo)
    await newLoading
    expect(store.project).toEqual(projectTwo)
    expect(store.tasks).toEqual([])
    expect(store.loading).toBe(false)
  })

  it('reset invalidates a pending mutation and its finally block', async () => {
    const oldCreate = deferred<Task>()
    vi.mocked(requestCreateTask).mockReturnValue(oldCreate.promise)
    const store = seedLoadedStore()

    const creating = store.createTask(taskPayload)
    store.reset()
    oldCreate.resolve({ ...taskOne, id: 40 })
    await creating

    expect(store.currentProjectId).toBeNull()
    expect(store.tasks).toEqual([])
    expect(store.taskSubmitting).toBe(false)
  })

  describe('task ordering', () => {
    const todoFirst = { ...taskOne, id: 21, title: 'Todo first', sort_order: 1 }
    const todoSecond = { ...taskOne, id: 22, title: 'Todo second', sort_order: 2 }
    const todoThird = { ...taskOne, id: 23, title: 'Todo third', sort_order: 3 }
    const progressFirst = {
      ...taskOne,
      id: 31,
      title: 'Progress first',
      status: 'in_progress' as const,
      sort_order: 1,
    }
    const progressSecond = { ...progressFirst, id: 32, title: 'Progress second', sort_order: 2 }
    const doneTask = {
      ...taskOne,
      id: 41,
      title: 'Done',
      status: 'done' as const,
      sort_order: 1,
    }

    function seedOrderingStore(tasks: Task[] = [todoFirst, todoSecond, todoThird, progressFirst, progressSecond, doneTask]) {
      const store = seedLoadedStore()
      store.tasks = tasks
      return store
    }

    it.each([
      [todoThird.id, 0, [23, 21, 22]],
      [todoFirst.id, 2, [22, 23, 21]],
      [todoFirst.id, 99, [22, 23, 21]],
    ] as const)('moves task %s within a column to index %s and bounds the final index', async (taskId, newIndex, expectedIds) => {
      vi.mocked(updateTaskOrder).mockResolvedValue(3)
      const store = seedOrderingStore()

      await store.moveTask({ taskId, from: 'todo', to: 'todo', newIndex })

      expect(store.columns.todo.map(task => task.id)).toEqual(expectedIds)
      expect(updateTaskOrder).toHaveBeenCalledExactlyOnceWith(
        expectedIds.map((id, index) => ({ task_id: id, status: 'todo', sort_order: index + 1 })),
      )
      expect(store.ordering).toBe(false)
      expect(store.orderingError).toBeNull()
    })

    it('moves across columns into a non-empty target with source rows first and one-based continuous orders', async () => {
      const request = deferred<number>()
      vi.mocked(updateTaskOrder).mockReturnValue(request.promise)
      const store = seedOrderingStore()
      const untouched = store.tasks.find(task => task.id === doneTask.id)

      const moving = store.moveTask({ taskId: todoSecond.id, from: 'todo', to: 'in_progress', newIndex: 1 })

      expect(store.ordering).toBe(true)
      expect(store.orderingError).toBeNull()
      expect(store.columns.todo.map(task => [task.id, task.sort_order])).toEqual([[21, 1], [23, 2]])
      expect(store.columns.in_progress.map(task => [task.id, task.status, task.sort_order])).toEqual([
        [31, 'in_progress', 1],
        [22, 'in_progress', 2],
        [32, 'in_progress', 3],
      ])
      expect(updateTaskOrder).toHaveBeenCalledExactlyOnceWith([
        { task_id: 21, status: 'todo', sort_order: 1 },
        { task_id: 23, status: 'todo', sort_order: 2 },
        { task_id: 31, status: 'in_progress', sort_order: 1 },
        { task_id: 22, status: 'in_progress', sort_order: 2 },
        { task_id: 32, status: 'in_progress', sort_order: 3 },
      ])
      expect(store.tasks.find(task => task.id === doneTask.id)).toBe(untouched)

      request.resolve(5)
      await moving
      expect(store.ordering).toBe(false)
    })

    it('moves across columns into an empty target and includes every remaining source row', async () => {
      vi.mocked(updateTaskOrder).mockResolvedValue(3)
      const store = seedOrderingStore([todoFirst, todoSecond, todoThird])

      await store.moveTask({ taskId: todoSecond.id, from: 'todo', to: 'done', newIndex: 20 })

      expect(store.columns.todo.map(task => task.id)).toEqual([21, 23])
      expect(store.columns.done.map(task => task.id)).toEqual([22])
      expect(updateTaskOrder).toHaveBeenCalledExactlyOnceWith([
        { task_id: 21, status: 'todo', sort_order: 1 },
        { task_id: 23, status: 'todo', sort_order: 2 },
        { task_id: 22, status: 'done', sort_order: 1 },
      ])
    })

    it('treats a normalized same-column position as a side-effect-free no-op', async () => {
      const store = seedOrderingStore()
      const before = store.tasks

      await expect(store.moveTask({ taskId: todoSecond.id, from: 'todo', to: 'todo', newIndex: 1 })).resolves.toBeUndefined()

      expect(store.tasks).toBe(before)
      expect(store.ordering).toBe(false)
      expect(updateTaskOrder).not.toHaveBeenCalled()
    })

    it.each([
      [{ taskId: 0, from: 'todo', to: 'done', newIndex: 0 }],
      [{ taskId: Number.MAX_SAFE_INTEGER + 1, from: 'todo', to: 'done', newIndex: 0 }],
      [{ taskId: todoFirst.id, from: 'invalid', to: 'done', newIndex: 0 }],
      [{ taskId: todoFirst.id, from: 'todo', to: 'invalid', newIndex: 0 }],
      [{ taskId: todoFirst.id, from: 'todo', to: 'done', newIndex: -1 }],
      [{ taskId: todoFirst.id, from: 'todo', to: 'done', newIndex: 1.5 }],
    ])('rejects invalid runtime input without side effects: %o', async (input) => {
      const store = seedOrderingStore()
      const before = plainClone(store.$state)

      await expect(store.moveTask(input as never)).rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))

      expect(store.$state).toEqual(before)
      expect(updateTaskOrder).not.toHaveBeenCalled()
    })

    it.each(['filters', 'loading', 'submitting', 'ordering'] as const)(
      'rejects while %s blocks ordering without changing state',
      async (blockedBy) => {
        const store = seedOrderingStore()
        if (blockedBy === 'filters') store.filters = { priority: 'high' }
        if (blockedBy === 'loading') store.loading = true
        if (blockedBy === 'submitting') store.taskSubmitting = true
        if (blockedBy === 'ordering') store.ordering = true
        const before = plainClone(store.$state)

        await expect(store.moveTask({ taskId: todoFirst.id, from: 'todo', to: 'done', newIndex: 0 }))
          .rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))

        expect(store.$state).toEqual(before)
        expect(updateTaskOrder).not.toHaveBeenCalled()
      },
    )

    it('rejects missing, stale-status, and cross-project tasks without requesting the API', async () => {
      const store = seedOrderingStore([
        todoFirst,
        todoSecond,
        todoThird,
        progressFirst,
        progressSecond,
        doneTask,
        { ...todoFirst, id: 99, project_id: 2 },
      ])
      const before = plainClone(store.tasks)

      await expect(store.moveTask({ taskId: 404, from: 'todo', to: 'done', newIndex: 0 })).rejects.toBeTruthy()
      await expect(store.moveTask({ taskId: todoFirst.id, from: 'done', to: 'todo', newIndex: 0 })).rejects.toBeTruthy()
      await expect(store.moveTask({ taskId: 99, from: 'todo', to: 'done', newIndex: 0 })).rejects.toBeTruthy()

      expect(store.tasks).toEqual(before)
      expect(updateTaskOrder).not.toHaveBeenCalled()
    })

    it('rejects moving a valid task when any board task belongs to another project', async () => {
      const store = seedOrderingStore([
        todoFirst,
        todoSecond,
        progressFirst,
        { ...doneTask, project_id: projectTwo.id },
      ])
      const before = plainClone(store.$state)

      await expect(store.moveTask({ taskId: todoFirst.id, from: 'todo', to: 'in_progress', newIndex: 0 }))
        .rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))

      expect(store.$state).toEqual(before)
      expect(updateTaskOrder).not.toHaveBeenCalled()
    })

    it.each([
      ['same column', [todoFirst, { ...todoSecond, id: todoFirst.id }, progressFirst]],
      ['different columns', [todoFirst, { ...progressFirst, id: todoFirst.id }]],
    ] as const)('rejects duplicate task ids across the %s without side effects', async (_case, duplicateTasks) => {
      const store = seedOrderingStore([...duplicateTasks])
      const before = plainClone(store.$state)

      await expect(store.moveTask({ taskId: todoFirst.id, from: 'todo', to: 'done', newIndex: 0 }))
        .rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))

      expect(store.$state).toEqual(before)
      expect(updateTaskOrder).not.toHaveBeenCalled()
    })

    it('fully rolls back an API failure without mutating the captured snapshot and exposes a normalized error', async () => {
      const requestError = new Error('ordering failed')
      vi.mocked(updateTaskOrder).mockRejectedValue(requestError)
      const store = seedOrderingStore()
      const snapshot = plainClone(store.tasks)
      const snapshotGuard = plainClone(snapshot)

      await expect(store.moveTask({ taskId: todoSecond.id, from: 'todo', to: 'done', newIndex: 0 }))
        .rejects.toEqual(toApiError(requestError))

      expect(snapshot).toEqual(snapshotGuard)
      expect(store.tasks).toEqual(snapshot)
      expect(store.ordering).toBe(false)
      expect(store.orderingError).toEqual(toApiError(requestError))
    })

    it('treats an updated-count mismatch as a protocol failure and rolls back', async () => {
      vi.mocked(updateTaskOrder).mockResolvedValue(1)
      const store = seedOrderingStore()
      const snapshot = plainClone(store.tasks)

      await expect(store.moveTask({ taskId: todoSecond.id, from: 'todo', to: 'done', newIndex: 0 }))
        .rejects.toEqual(expect.objectContaining({ code: 'protocol_error' }))

      expect(store.tasks).toEqual(snapshot)
      expect(store.ordering).toBe(false)
      expect(store.orderingError).toEqual(expect.objectContaining({ code: 'protocol_error' }))
    })

    it('holds a single-flight lock against duplicate ordering calls', async () => {
      const request = deferred<number>()
      vi.mocked(updateTaskOrder).mockReturnValue(request.promise)
      const store = seedOrderingStore()

      const first = store.moveTask({ taskId: todoFirst.id, from: 'todo', to: 'done', newIndex: 0 })
      await expect(store.moveTask({ taskId: todoSecond.id, from: 'todo', to: 'done', newIndex: 1 }))
        .rejects.toEqual(expect.objectContaining({ code: 'unknown_error' }))
      expect(updateTaskOrder).toHaveBeenCalledOnce()

      request.resolve(4)
      await first
    })

    it.each(['success', 'failure'] as const)(
      'project switching isolates an old ordering %s and its finally block',
      async (settlement) => {
        const oldOrder = deferred<number>()
        const newProject = deferred<Project>()
        const newMembers = deferred<ProjectMember[]>()
        const newTasks = deferred<Task[]>()
        vi.mocked(updateTaskOrder).mockReturnValue(oldOrder.promise)
        vi.mocked(getProject).mockReturnValue(newProject.promise)
        vi.mocked(listProjectMembers).mockReturnValue(newMembers.promise)
        vi.mocked(listTasks).mockReturnValue(newTasks.promise)
        const store = seedOrderingStore()

        const ordering = store.moveTask({ taskId: todoFirst.id, from: 'todo', to: 'done', newIndex: 0 })
        const orderOutcome = ordering.catch((error: unknown) => error)
        const loading = store.loadProject(2)

        expect(store.currentProjectId).toBe(2)
        expect(store.ordering).toBe(false)
        expect(store.orderingError).toBeNull()
        expect(store.loading).toBe(true)

        if (settlement === 'success') oldOrder.resolve(6)
        else oldOrder.reject(new Error('old ordering failed'))
        await orderOutcome
        expect(store.tasks).toEqual([])
        expect(store.ordering).toBe(false)
        expect(store.orderingError).toBeNull()
        expect(store.loading).toBe(true)

        const projectTwoTasks = [{ ...progressFirst, project_id: 2 }]
        newProject.resolve(projectTwo)
        newMembers.resolve([])
        newTasks.resolve(projectTwoTasks)
        await loading
        expect(store.tasks).toEqual(projectTwoTasks)
        expect(store.ordering).toBe(false)
        expect(store.orderingError).toBeNull()
      },
    )

    it.each(['success', 'failure'] as const)(
      'reset isolates an old ordering %s and its finally block',
      async (settlement) => {
        const oldOrder = deferred<number>()
        vi.mocked(updateTaskOrder).mockReturnValue(oldOrder.promise)
        const store = seedOrderingStore()

        const ordering = store.moveTask({ taskId: todoFirst.id, from: 'todo', to: 'done', newIndex: 0 })
        const outcome = ordering.catch((error: unknown) => error)
        store.reset()

        if (settlement === 'success') oldOrder.resolve(6)
        else oldOrder.reject(new Error('old ordering failed'))
        await outcome
        expect(store.currentProjectId).toBeNull()
        expect(store.tasks).toEqual([])
        expect(store.ordering).toBe(false)
        expect(store.orderingError).toBeNull()
      },
    )
  })
})
