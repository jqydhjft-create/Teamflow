export type TaskStatus = 'todo' | 'in_progress' | 'done'

export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: number
  project_id: number
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee_id: number | null
  sort_order: number
  comment_count: number
  created_at: string
}

export interface TaskPayload {
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee_id: number | null
}

export interface TaskFilters {
  priority?: TaskPriority
  assignee_id?: number
}

export interface TaskOrderItem {
  task_id: number
  status: TaskStatus
  sort_order: number
}
