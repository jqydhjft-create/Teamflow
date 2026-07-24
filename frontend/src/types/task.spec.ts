import { describe, expectTypeOf, it } from 'vitest'

import type { TaskOrderItem, TaskStatus } from './task'

describe('TaskOrderItem', () => {
  it('matches the task ordering contract exactly', () => {
    expectTypeOf<TaskOrderItem>().toEqualTypeOf<{
      task_id: number
      status: TaskStatus
      sort_order: number
    }>()
  })
})
