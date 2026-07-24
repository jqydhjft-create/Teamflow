import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Task, TaskFilters, TaskOrderItem, TaskPayload } from '@/types/task'

import { ApiProtocolError } from './errors'
import { http } from './http'
import { createTask, deleteTask, listTasks, updateTask, updateTaskOrder } from './tasks'

vi.mock('./http', () => ({
  http: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

const task: Task = {
  id: 31,
  project_id: 11,
  title: 'Prepare release notes',
  description: 'Summarize the shipped changes.',
  status: 'in_progress',
  priority: 'high',
  assignee_id: 7,
  sort_order: 2,
  comment_count: 4,
  created_at: '2026-07-24T08:00:00Z',
}

const taskPayload: TaskPayload = {
  title: 'Prepare release notes',
  description: null,
  status: 'todo',
  priority: 'medium',
  assignee_id: null,
}

const supplementaryCharacter = '\u{1F680}'

describe('tasks API', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('lists project tasks with a stable empty params object when filters are absent', async () => {
    vi.mocked(http.get).mockResolvedValue({
      data: { code: 200, data: { items: [task] } },
    })

    await expect(listTasks(11)).resolves.toEqual([task])
    expect(http.get).toHaveBeenCalledExactlyOnceWith('/api/projects/11/tasks', { params: {} })
  })

  it('sends only active supported task filters', async () => {
    const filters = Object.assign<TaskFilters, { ignored: string }>(
      { priority: 'high', assignee_id: 7 },
      { ignored: 'not-an-api-filter' },
    )
    vi.mocked(http.get).mockResolvedValue({ data: { code: 200, data: { items: [] } } })

    await expect(listTasks(11, filters)).resolves.toEqual([])
    expect(http.get).toHaveBeenCalledExactlyOnceWith('/api/projects/11/tasks', {
      params: { priority: 'high', assignee_id: 7 },
    })
  })

  it('omits supported filters whose values are undefined', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { code: 200, data: { items: [] } } })

    await expect(listTasks(11, { priority: undefined, assignee_id: undefined })).resolves.toEqual([])
    expect(http.get).toHaveBeenCalledExactlyOnceWith('/api/projects/11/tasks', { params: {} })
  })

  it('creates a task in the selected project', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { code: 201, data: task } })

    await expect(createTask(11, taskPayload)).resolves.toEqual(task)
    expect(http.post).toHaveBeenCalledExactlyOnceWith('/api/projects/11/tasks', taskPayload)
  })

  it('updates a task by id', async () => {
    vi.mocked(http.put).mockResolvedValue({ data: { code: 200, data: task } })

    await expect(updateTask(31, taskPayload)).resolves.toEqual(task)
    expect(http.put).toHaveBeenCalledExactlyOnceWith('/api/tasks/31', taskPayload)
  })

  it('deletes a task only when the server confirms deletion', async () => {
    vi.mocked(http.delete).mockResolvedValue({
      data: { code: 200, data: { deleted: true } },
    })

    await expect(deleteTask(31)).resolves.toBeUndefined()
    expect(http.delete).toHaveBeenCalledExactlyOnceWith('/api/tasks/31')
  })

  it('updates task order and returns the decoded update count', async () => {
    const items: TaskOrderItem[] = [
      { task_id: 31, status: 'done', sort_order: 1 },
      { task_id: 32, status: 'in_progress', sort_order: 2 },
    ]
    vi.mocked(http.patch).mockResolvedValue({
      data: { code: 200, data: { updated: 2 } },
    })

    await expect(updateTaskOrder(items)).resolves.toBe(2)
    expect(http.patch).toHaveBeenCalledExactlyOnceWith('/api/tasks/batch-order', { items })
  })

  it.each([
    ['200 ASCII task-title code points', { ...task, title: 't'.repeat(200) }],
    [
      '200 supplementary task-title code points',
      { ...task, title: supplementaryCharacter.repeat(200) },
    ],
  ])('accepts %s', async (_case, item) => {
    vi.mocked(http.get).mockResolvedValue({ data: { code: 200, data: { items: [item] } } })

    await expect(listTasks(11)).resolves.toEqual([item])
  })

  it('rejects 201 supplementary task-title code points', async () => {
    vi.mocked(http.get).mockResolvedValue({
      data: {
        code: 200,
        data: { items: [{ ...task, title: supplementaryCharacter.repeat(201) }] },
      },
    })

    await expect(listTasks(11)).rejects.toBeInstanceOf(ApiProtocolError)
  })

  it.each([
    ['missing list data', { code: 200, data: null }],
    ['missing items', { code: 200, data: {} }],
    ['non-array items', { code: 200, data: { items: task } }],
    ['primitive task', { code: 200, data: { items: [31] } }],
    ['invalid task id', { code: 200, data: { items: [{ ...task, id: 0 }] } }],
    ['invalid project id', { code: 200, data: { items: [{ ...task, project_id: 1.5 }] } }],
    ['missing title', { code: 200, data: { items: [{ ...task, title: undefined }] } }],
    ['empty title', { code: 200, data: { items: [{ ...task, title: ' ' }] } }],
    ['overlong title', { code: 200, data: { items: [{ ...task, title: 't'.repeat(201) }] } }],
    ['invalid description', { code: 200, data: { items: [{ ...task, description: 7 }] } }],
    ['unknown status', { code: 200, data: { items: [{ ...task, status: 'blocked' }] } }],
    ['unknown priority', { code: 200, data: { items: [{ ...task, priority: 'urgent' }] } }],
    ['invalid assignee id', { code: 200, data: { items: [{ ...task, assignee_id: -1 }] } }],
    ['non-integer sort order', { code: 200, data: { items: [{ ...task, sort_order: 1.5 }] } }],
    ['non-positive sort order', { code: 200, data: { items: [{ ...task, sort_order: 0 }] } }],
    ['negative comment count', { code: 200, data: { items: [{ ...task, comment_count: -1 }] } }],
    ['non-integer comment count', { code: 200, data: { items: [{ ...task, comment_count: 1.5 }] } }],
    ['empty creation timestamp', { code: 200, data: { items: [{ ...task, created_at: '' }] } }],
  ])('rejects a task list with %s', async (_case, body) => {
    vi.mocked(http.get).mockResolvedValue({ data: body })

    await expect(listTasks(11)).rejects.toBeInstanceOf(ApiProtocolError)
  })

  it.each([
    ['missing task data', { code: 200, data: null }],
    ['missing required field', { code: 200, data: { ...task, priority: undefined } }],
    ['unsafe comment count', { code: 200, data: { ...task, comment_count: Number.MAX_SAFE_INTEGER + 1 } }],
  ])('rejects create success with %s', async (_case, body) => {
    vi.mocked(http.post).mockResolvedValue({ data: body })

    await expect(createTask(11, taskPayload)).rejects.toBeInstanceOf(ApiProtocolError)
  })

  it('uses the same strict decoder for updated tasks', async () => {
    vi.mocked(http.put).mockResolvedValue({
      data: { code: 200, data: { ...task, assignee_id: 0 } },
    })

    await expect(updateTask(31, taskPayload)).rejects.toBeInstanceOf(ApiProtocolError)
  })

  it.each([
    ['false confirmation', { code: 200, data: { deleted: false } }],
    ['missing confirmation', { code: 200, data: {} }],
    ['primitive deletion data', { code: 200, data: true }],
  ])('rejects delete success with %s', async (_case, body) => {
    vi.mocked(http.delete).mockResolvedValue({ data: body })

    await expect(deleteTask(31)).rejects.toBeInstanceOf(ApiProtocolError)
  })

  it.each([
    ['negative updated count', { code: 200, data: { updated: -1 } }],
    ['non-integer updated count', { code: 200, data: { updated: 1.5 } }],
    ['missing updated count', { code: 200, data: {} }],
    ['primitive batch data', { code: 200, data: 2 }],
  ])('rejects batch-order success with %s', async (_case, body) => {
    vi.mocked(http.patch).mockResolvedValue({ data: body })

    await expect(updateTaskOrder([])).rejects.toBeInstanceOf(ApiProtocolError)
  })

  it('accepts zero as a non-negative batch update count', async () => {
    vi.mocked(http.patch).mockResolvedValue({ data: { code: 200, data: { updated: 0 } } })

    await expect(updateTaskOrder([])).resolves.toBe(0)
  })
})
