import type {
  Task,
  TaskFilters,
  TaskOrderItem,
  TaskPayload,
  TaskPriority,
  TaskStatus,
} from '@/types/task'

import {
  decodeEnvelope,
  decodeNonEmptyString,
  decodeNullableString,
  decodePositiveInteger,
  isObject,
} from './decoders'
import { ApiProtocolError } from './errors'
import { http } from './http'

function decodeTaskStatus(value: unknown): TaskStatus {
  if (value !== 'todo' && value !== 'in_progress' && value !== 'done') {
    throw new ApiProtocolError()
  }

  return value
}

function decodeTaskPriority(value: unknown): TaskPriority {
  if (value !== 'low' && value !== 'medium' && value !== 'high') {
    throw new ApiProtocolError()
  }

  return value
}

function decodeTitle(value: unknown): string {
  const decoded = decodeNonEmptyString(value)

  if (Array.from(decoded).length > 200) {
    throw new ApiProtocolError()
  }

  return decoded
}

function decodeNullablePositiveInteger(value: unknown): number | null {
  if (value === null) {
    return null
  }

  return decodePositiveInteger(value)
}

function decodeNonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ApiProtocolError()
  }

  return value
}

function decodeTask(value: unknown): Task {
  if (!isObject(value)) {
    throw new ApiProtocolError()
  }

  return {
    id: decodePositiveInteger(value.id),
    project_id: decodePositiveInteger(value.project_id),
    title: decodeTitle(value.title),
    description: decodeNullableString(value.description),
    status: decodeTaskStatus(value.status),
    priority: decodeTaskPriority(value.priority),
    assignee_id: decodeNullablePositiveInteger(value.assignee_id),
    sort_order: decodePositiveInteger(value.sort_order),
    comment_count: decodeNonNegativeInteger(value.comment_count),
    created_at: decodeNonEmptyString(value.created_at),
  }
}

function decodeTaskItems(value: unknown): Task[] {
  if (!isObject(value) || !Array.isArray(value.items)) {
    throw new ApiProtocolError()
  }

  return value.items.map(decodeTask)
}

function decodeDeletion(value: unknown): void {
  if (!isObject(value) || value.deleted !== true) {
    throw new ApiProtocolError()
  }
}

function decodeUpdatedCount(value: unknown): number {
  if (!isObject(value)) {
    throw new ApiProtocolError()
  }

  return decodeNonNegativeInteger(value.updated)
}

export async function listTasks(projectId: number, filters?: TaskFilters): Promise<Task[]> {
  const params: { priority?: TaskPriority; assignee_id?: number } = {}

  if (filters?.priority !== undefined) {
    params.priority = filters.priority
  }

  if (filters?.assignee_id !== undefined) {
    params.assignee_id = filters.assignee_id
  }

  const response = await http.get<unknown>(`/api/projects/${projectId}/tasks`, { params })

  return decodeEnvelope(response.data, decodeTaskItems)
}

export async function createTask(projectId: number, payload: TaskPayload): Promise<Task> {
  const response = await http.post<unknown>(`/api/projects/${projectId}/tasks`, payload)

  return decodeEnvelope(response.data, decodeTask)
}

export async function updateTask(taskId: number, payload: TaskPayload): Promise<Task> {
  const response = await http.put<unknown>(`/api/tasks/${taskId}`, payload)

  return decodeEnvelope(response.data, decodeTask)
}

export async function deleteTask(taskId: number): Promise<void> {
  const response = await http.delete<unknown>(`/api/tasks/${taskId}`)

  return decodeEnvelope(response.data, decodeDeletion)
}

export async function updateTaskOrder(items: TaskOrderItem[]): Promise<number> {
  const response = await http.patch<unknown>('/api/tasks/batch-order', { items })

  return decodeEnvelope(response.data, decodeUpdatedCount)
}
