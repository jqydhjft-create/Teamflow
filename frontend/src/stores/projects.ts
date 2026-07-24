import { ref } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'

import type { ApiError } from '@/types/auth'
import type {
  CreateProjectPayload,
  JoinProjectPayload,
  Project,
  ProjectListItem,
} from '@/types/project'

import { toApiError } from '@/api/errors'
import {
  createProject as requestCreateProject,
  joinProject as requestJoinProject,
  listProjects as requestListProjects,
} from '@/api/projects'

const MUTATION_IN_PROGRESS_MESSAGE = 'A project mutation is already in progress'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<ProjectListItem[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<ApiError | null>(null)
  const submitting = ref(false)

  let currentTicket = 0
  let resetEpoch = 0
  let loadOperation: Promise<void> | null = null
  let createOperation: Promise<Project> | null = null
  let createPayloadSnapshot: CreateProjectPayload | null = null
  let joinOperation: Promise<number> | null = null
  let joinPayloadSnapshot: JoinProjectPayload | null = null

  function claimTicket(): number {
    currentTicket += 1
    return currentTicket
  }

  function invalidateLoads(): number {
    const ticket = claimTicket()
    loadOperation = null
    loading.value = false
    return ticket
  }

  function isSameCreatePayload(left: CreateProjectPayload, right: CreateProjectPayload): boolean {
    return left.name === right.name && left.description === right.description
  }

  function isSameJoinPayload(left: JoinProjectPayload, right: JoinProjectPayload): boolean {
    return left.projectId === right.projectId && left.invite_code === right.invite_code
  }

  function loadProjects(options: { force?: boolean } = {}): Promise<void> {
    if (loaded.value && !options.force) {
      return Promise.resolve()
    }

    if (!options.force && loadOperation) {
      return loadOperation
    }

    const ticket = claimTicket()
    loading.value = true

    const request = requestListProjects()
    const operation = request.then(
      (items) => {
        if (ticket !== currentTicket) {
          return
        }

        projects.value = items
        loaded.value = true
        error.value = null
      },
      (requestError: unknown) => {
        if (ticket === currentTicket) {
          error.value = toApiError(requestError)
        }
      },
    ).finally(() => {
      if (ticket === currentTicket) {
        loading.value = false
      }
      if (loadOperation === operation) {
        loadOperation = null
      }
    })

    loadOperation = operation
    return operation
  }

  function create(payload: CreateProjectPayload): Promise<Project> {
    if (createOperation) {
      if (createPayloadSnapshot && isSameCreatePayload(payload, createPayloadSnapshot)) {
        return createOperation
      }
      return Promise.reject(new Error(MUTATION_IN_PROGRESS_MESSAGE))
    }
    if (submitting.value) {
      return Promise.reject(new Error(MUTATION_IN_PROGRESS_MESSAGE))
    }

    const epoch = resetEpoch
    invalidateLoads()
    submitting.value = true
    error.value = null
    createPayloadSnapshot = { ...payload }

    const request = requestCreateProject(payload)
    const operation = request.then(
      (project) => {
        if (epoch === resetEpoch && createOperation === operation && loaded.value) {
          invalidateLoads()
          projects.value = [
            { ...project, role: 'owner' },
            ...projects.value.filter(item => item.id !== project.id),
          ]
          error.value = null
        }
        return project
      },
      (requestError: unknown) => {
        if (epoch === resetEpoch && createOperation === operation) {
          error.value = toApiError(requestError)
        }
        throw requestError
      },
    ).finally(() => {
      if (epoch === resetEpoch && createOperation === operation) {
        submitting.value = false
      }
      if (createOperation === operation) {
        createOperation = null
        createPayloadSnapshot = null
      }
    })

    createOperation = operation
    return operation
  }

  function join(payload: JoinProjectPayload): Promise<number> {
    if (joinOperation) {
      if (joinPayloadSnapshot && isSameJoinPayload(payload, joinPayloadSnapshot)) {
        return joinOperation
      }
      return Promise.reject(new Error(MUTATION_IN_PROGRESS_MESSAGE))
    }
    if (submitting.value) {
      return Promise.reject(new Error(MUTATION_IN_PROGRESS_MESSAGE))
    }

    const epoch = resetEpoch
    const ticket = invalidateLoads()
    submitting.value = true
    error.value = null
    joinPayloadSnapshot = { ...payload }

    const request = requestJoinProject(payload)
    const operation = request.then(
      async () => {
        if (epoch === resetEpoch) {
          await loadProjects({ force: true })
        }
        return payload.projectId
      },
      (requestError: unknown) => {
        if (epoch === resetEpoch && ticket === currentTicket) {
          error.value = toApiError(requestError)
        }
        throw requestError
      },
    ).finally(() => {
      if (epoch === resetEpoch && joinOperation === operation) {
        submitting.value = false
      }
      if (joinOperation === operation) {
        joinOperation = null
        joinPayloadSnapshot = null
      }
    })

    joinOperation = operation
    return operation
  }

  function reset(): void {
    resetEpoch += 1
    claimTicket()
    loadOperation = null
    createOperation = null
    createPayloadSnapshot = null
    joinOperation = null
    joinPayloadSnapshot = null
    projects.value = []
    loading.value = false
    loaded.value = false
    error.value = null
    submitting.value = false
  }

  return {
    create,
    error,
    join,
    loaded,
    loading,
    loadProjects,
    projects,
    reset,
    submitting,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useProjectsStore, import.meta.hot))
}
