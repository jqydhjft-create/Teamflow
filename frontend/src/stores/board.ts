import { computed, ref, toRaw } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'

import type { ApiError } from '@/types/auth'
import type { Project, ProjectMember } from '@/types/project'
import type { Task, TaskFilters, TaskOrderItem, TaskPayload, TaskStatus } from '@/types/task'

import { ApiProtocolError, toApiError } from '@/api/errors'
import { getProject, listProjectMembers } from '@/api/projects'
import {
  createTask as requestCreateTask,
  deleteTask as requestDeleteTask,
  listTasks,
  updateTaskOrder,
  updateTask as requestUpdateTask,
} from '@/api/tasks'

type BoardErrorKind = null | 'forbidden' | 'not_found' | 'load'

const EMPTY_FILTERS: TaskFilters = {
  priority: undefined,
  assignee_id: undefined,
}

function normalizedError(message: string): ApiError {
  return toApiError(new Error(message))
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === 'todo' || value === 'in_progress' || value === 'done'
}

function replaceOrAppend(tasks: Task[], confirmed: Task): Task[] {
  const index = tasks.findIndex(task => task.id === confirmed.id)

  if (index === -1) {
    return [...tasks, confirmed]
  }

  const withoutDuplicates = tasks.filter(task => task.id !== confirmed.id)
  withoutDuplicates.splice(index, 0, confirmed)
  return withoutDuplicates
}

function matchesFilters(task: Task, filters: TaskFilters): boolean {
  return (
    (filters.priority === undefined || task.priority === filters.priority)
    && (filters.assignee_id === undefined || task.assignee_id === filters.assignee_id)
  )
}

function projectTask(tasks: Task[], confirmed: Task, filters: TaskFilters): Task[] {
  return matchesFilters(confirmed, filters)
    ? replaceOrAppend(tasks, confirmed)
    : tasks.filter(task => task.id !== confirmed.id)
}

export const useBoardStore = defineStore('board', () => {
  const currentProjectId = ref<number | null>(null)
  const project = ref<Project | null>(null)
  const members = ref<ProjectMember[]>([])
  const tasks = ref<Task[]>([])
  const filters = ref<TaskFilters>({ ...EMPTY_FILTERS })
  const loading = ref(false)
  const loaded = ref(false)
  const errorKind = ref<BoardErrorKind>(null)
  const taskSubmitting = ref(false)
  const ordering = ref(false)
  const orderingError = ref<ApiError | null>(null)

  let resetEpoch = 0
  let loadTicket = 0
  let filterTicket = 0
  let mutationTicket = 0
  let orderingTicket = 0
  let activityTicket = 0
  let loadOperation: Promise<void> | null = null
  let loadOperationProjectId: number | null = null
  let loadError: ApiError | null = null
  let mutationOperation: Promise<unknown> | null = null
  let orderingOperation: Promise<void> | null = null

  const columns = computed<Record<TaskStatus, Task[]>>(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
    }

    for (const task of tasks.value) {
      grouped[task.status].push(task)
    }

    for (const status of Object.keys(grouped) as TaskStatus[]) {
      grouped[status].sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
    }

    return grouped
  })

  const memberById = computed(() => new Map(members.value.map(member => [member.user_id, member])))
  const filtersActive = computed(() => (
    filters.value.priority !== undefined
    || (filters.value.assignee_id !== undefined && isPositiveSafeInteger(filters.value.assignee_id))
  ))
  const dragDisabled = computed(() => (
    filtersActive.value
    || loading.value
    || taskSubmitting.value
    || ordering.value
  ))

  function claimActivity(): number {
    activityTicket += 1
    loading.value = true
    return activityTicket
  }

  function clearDomainState(id: number): void {
    currentProjectId.value = id
    project.value = null
    members.value = []
    tasks.value = []
    filters.value = { ...EMPTY_FILTERS }
    errorKind.value = null
    orderingError.value = null
    loaded.value = false
  }

  function invalidateFilters(): void {
    filterTicket += 1
  }

  function invalidateMutation(): void {
    mutationTicket += 1
    mutationOperation = null
    taskSubmitting.value = false
  }

  function invalidateOrdering(): void {
    orderingTicket += 1
    orderingOperation = null
    ordering.value = false
    orderingError.value = null
  }

  function loadProject(id: number): Promise<void> {
    if (!isPositiveSafeInteger(id)) {
      return Promise.reject(normalizedError('Project id must be a positive safe integer'))
    }

    if (loadOperation && loadOperationProjectId === id) {
      return loadOperation
    }
    if (currentProjectId.value === id && (taskSubmitting.value || ordering.value)) {
      return Promise.reject(normalizedError('The current project is busy'))
    }

    const epoch = resetEpoch
    const ticket = ++loadTicket
    const activity = claimActivity()
    invalidateFilters()
    invalidateMutation()
    invalidateOrdering()
    clearDomainState(id)
    loadError = null

    const projectRequest = getProject(id)
    const membersRequest = listProjectMembers(id)
    const tasksRequest = listTasks(id, undefined)

    const operation = Promise.all([projectRequest, membersRequest, tasksRequest]).then(
      ([confirmedProject, confirmedMembers, confirmedTasks]) => {
        if (epoch !== resetEpoch || ticket !== loadTicket) {
          return
        }

        project.value = confirmedProject
        members.value = confirmedMembers
        tasks.value = confirmedTasks
        loaded.value = true
        errorKind.value = null
        loadError = null
      },
      (requestError: unknown) => {
        if (epoch !== resetEpoch || ticket !== loadTicket) {
          return
        }

        const error = toApiError(requestError)
        loadError = error
        errorKind.value = error.status === 403
          ? 'forbidden'
          : error.status === 404
            ? 'not_found'
            : 'load'
      },
    ).finally(() => {
      if (epoch === resetEpoch && ticket === loadTicket && activity === activityTicket) {
        loading.value = false
      }
      if (loadOperation === operation) {
        loadOperation = null
        loadOperationProjectId = null
      }
    })

    loadOperation = operation
    loadOperationProjectId = id
    return operation
  }

  function applyFilters(nextFilters?: TaskFilters): Promise<void> {
    if (taskSubmitting.value || ordering.value) {
      return Promise.reject(normalizedError('The board is busy'))
    }

    const projectId = currentProjectId.value
    if (projectId === null) {
      return Promise.reject(normalizedError('A current project is required'))
    }
    if (
      nextFilters?.assignee_id !== undefined
      && !isPositiveSafeInteger(nextFilters.assignee_id)
    ) {
      return Promise.reject(normalizedError('Assignee id must be a positive safe integer'))
    }

    const activeFilters: TaskFilters = {
      priority: nextFilters?.priority,
      assignee_id: nextFilters?.assignee_id,
    }
    const requestFilters = activeFilters.priority === undefined && activeFilters.assignee_id === undefined
      ? undefined
      : activeFilters
    const epoch = resetEpoch
    const ticket = ++filterTicket
    const activity = claimActivity()
    const baseLoad = loadOperationProjectId === projectId ? loadOperation : null
    filters.value = activeFilters

    const isCurrent = () => (
      epoch === resetEpoch
      && ticket === filterTicket
      && currentProjectId.value === projectId
    )

    return (async () => {
      if (baseLoad) {
        await baseLoad

        if (!isCurrent()) {
          return
        }
        if (!loaded.value || project.value === null) {
          throw loadError ?? normalizedError('The project could not be loaded')
        }
      }

      if (!isCurrent()) {
        return
      }

      let confirmedTasks: Task[]
      try {
        confirmedTasks = await listTasks(projectId, requestFilters)
      }
      catch (requestError: unknown) {
        throw toApiError(requestError)
      }

      if (isCurrent()) {
        tasks.value = confirmedTasks
      }
    })().finally(() => {
      if (
        isCurrent()
        && activity === activityTicket
      ) {
        loading.value = false
      }
    })
  }

  function beginMutation(): { epoch: number; projectId: number; ticket: number } | ApiError {
    if (currentProjectId.value === null) {
      return normalizedError('A current project is required')
    }
    if (!loaded.value || loading.value || ordering.value) {
      return normalizedError('The board is not ready for task mutations')
    }
    if (mutationOperation || taskSubmitting.value) {
      return normalizedError('A task mutation is already in progress')
    }

    const ticket = ++mutationTicket
    taskSubmitting.value = true
    return { epoch: resetEpoch, projectId: currentProjectId.value, ticket }
  }

  function isMutationCurrent(epoch: number, ticket: number, operation: Promise<unknown>): boolean {
    return epoch === resetEpoch && ticket === mutationTicket && mutationOperation === operation
  }

  function createTask(payload: TaskPayload): Promise<Task> {
    const claim = beginMutation()
    if ('code' in claim) {
      return Promise.reject(claim)
    }

    const operation = requestCreateTask(claim.projectId, payload).then(
      (confirmedTask) => {
        if (confirmedTask.project_id !== claim.projectId) {
          throw normalizedError('Created task project does not match the current project')
        }
        if (isMutationCurrent(claim.epoch, claim.ticket, operation)) {
          tasks.value = projectTask(tasks.value, confirmedTask, filters.value)
        }
        return confirmedTask
      },
      (requestError: unknown) => {
        throw toApiError(requestError)
      },
    ).finally(() => {
      if (isMutationCurrent(claim.epoch, claim.ticket, operation)) {
        taskSubmitting.value = false
        mutationOperation = null
      }
    })

    mutationOperation = operation
    return operation
  }

  function updateTask(taskId: number, payload: TaskPayload): Promise<Task> {
    if (!isPositiveSafeInteger(taskId)) {
      return Promise.reject(normalizedError('Task id must be a positive safe integer'))
    }

    const claim = beginMutation()
    if ('code' in claim) {
      return Promise.reject(claim)
    }

    const operation = requestUpdateTask(taskId, payload).then(
      (confirmedTask) => {
        if (confirmedTask.id !== taskId || confirmedTask.project_id !== claim.projectId) {
          throw normalizedError('Updated task context does not match the request')
        }
        if (isMutationCurrent(claim.epoch, claim.ticket, operation)) {
          tasks.value = projectTask(tasks.value, confirmedTask, filters.value)
        }
        return confirmedTask
      },
      (requestError: unknown) => {
        throw toApiError(requestError)
      },
    ).finally(() => {
      if (isMutationCurrent(claim.epoch, claim.ticket, operation)) {
        taskSubmitting.value = false
        mutationOperation = null
      }
    })

    mutationOperation = operation
    return operation
  }

  function deleteTask(taskId: number): Promise<void> {
    if (!isPositiveSafeInteger(taskId)) {
      return Promise.reject(normalizedError('Task id must be a positive safe integer'))
    }

    const claim = beginMutation()
    if ('code' in claim) {
      return Promise.reject(claim)
    }

    const operation = requestDeleteTask(taskId).then(
      () => {
        if (isMutationCurrent(claim.epoch, claim.ticket, operation)) {
          tasks.value = tasks.value.filter(task => task.id !== taskId)
        }
      },
      (requestError: unknown) => {
        throw toApiError(requestError)
      },
    ).finally(() => {
      if (isMutationCurrent(claim.epoch, claim.ticket, operation)) {
        taskSubmitting.value = false
        mutationOperation = null
      }
    })

    mutationOperation = operation
    return operation
  }

  function moveTask(input: {
    taskId: number
    from: TaskStatus
    to: TaskStatus
    newIndex: number
  }): Promise<void> {
    if (
      !isPositiveSafeInteger(input.taskId)
      || !isTaskStatus(input.from)
      || !isTaskStatus(input.to)
      || !Number.isSafeInteger(input.newIndex)
      || input.newIndex < 0
    ) {
      return Promise.reject(normalizedError('Invalid task ordering input'))
    }

    const projectId = currentProjectId.value
    if (
      projectId === null
      || !loaded.value
      || loading.value
      || taskSubmitting.value
      || ordering.value
      || orderingOperation
    ) {
      return Promise.reject(normalizedError('The board is not ready for task ordering'))
    }
    if (filtersActive.value) {
      return Promise.reject(normalizedError('Task ordering is unavailable while filters are active'))
    }

    const taskIds = new Set<number>()
    for (const boardTask of tasks.value) {
      if (boardTask.project_id !== projectId) {
        return Promise.reject(normalizedError('Every board task must belong to the current project'))
      }
      if (taskIds.has(boardTask.id)) {
        return Promise.reject(normalizedError('Board task ids must be unique'))
      }
      taskIds.add(boardTask.id)
    }

    const task = tasks.value.find(candidate => candidate.id === input.taskId)
    if (!task || task.status !== input.from || task.project_id !== projectId) {
      return Promise.reject(normalizedError('The task does not belong to the requested board column'))
    }

    const source = [...columns.value[input.from]]
    const sourceIndex = source.findIndex(candidate => candidate.id === input.taskId)
    if (sourceIndex === -1) {
      return Promise.reject(normalizedError('The task was not found in its source column'))
    }

    const [movedTask] = source.splice(sourceIndex, 1)
    if (!movedTask) {
      return Promise.reject(normalizedError('The task could not be moved'))
    }

    const target = input.from === input.to ? source : [...columns.value[input.to]]
    const targetIndex = Math.min(input.newIndex, target.length)
    if (input.from === input.to && targetIndex === sourceIndex) {
      return Promise.resolve()
    }
    target.splice(targetIndex, 0, movedTask)

    const snapshot = structuredClone(toRaw(tasks.value).map(item => toRaw(item)))
    const affected = new Map<number, Pick<TaskOrderItem, 'status' | 'sort_order'>>()
    const payload: TaskOrderItem[] = []
    const appendColumn = (columnTasks: Task[], status: TaskStatus) => {
      columnTasks.forEach((columnTask, index) => {
        const order = { status, sort_order: index + 1 }
        affected.set(columnTask.id, order)
        payload.push({ task_id: columnTask.id, ...order })
      })
    }

    if (input.from === input.to) {
      appendColumn(target, input.to)
    }
    else {
      appendColumn(source, input.from)
      appendColumn(target, input.to)
    }

    tasks.value = tasks.value.map((currentTask) => {
      const order = affected.get(currentTask.id)
      return order ? { ...currentTask, ...order } : currentTask
    })
    ordering.value = true
    orderingError.value = null

    const epoch = resetEpoch
    const ticket = ++orderingTicket
    const isCurrent = () => (
      epoch === resetEpoch
      && ticket === orderingTicket
      && currentProjectId.value === projectId
    )

    const operation = (async () => {
      try {
        const updated = await updateTaskOrder(payload)
        if (updated !== payload.length) {
          throw new ApiProtocolError()
        }
      }
      catch (requestError: unknown) {
        const error = toApiError(requestError)
        if (isCurrent()) {
          tasks.value = snapshot
          orderingError.value = error
        }
        throw error
      }
      finally {
        if (isCurrent()) {
          ordering.value = false
          orderingOperation = null
        }
      }
    })()

    orderingOperation = operation
    return operation
  }

  function reset(): void {
    resetEpoch += 1
    loadTicket += 1
    filterTicket += 1
    mutationTicket += 1
    activityTicket += 1
    loadOperation = null
    loadOperationProjectId = null
    loadError = null
    mutationOperation = null
    invalidateOrdering()
    currentProjectId.value = null
    project.value = null
    members.value = []
    tasks.value = []
    filters.value = { ...EMPTY_FILTERS }
    loading.value = false
    loaded.value = false
    errorKind.value = null
    taskSubmitting.value = false
  }

  return {
    applyFilters,
    columns,
    createTask,
    currentProjectId,
    deleteTask,
    dragDisabled,
    errorKind,
    filters,
    filtersActive,
    loaded,
    loading,
    loadProject,
    memberById,
    members,
    moveTask,
    ordering,
    orderingError,
    project,
    reset,
    tasks,
    taskSubmitting,
    updateTask,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useBoardStore, import.meta.hot))
}
