import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Task } from '@/types/task'

import KanbanColumn from './KanbanColumn.vue'

const sortable = vi.hoisted(() => {
  const instances: Array<{
    destroy: ReturnType<typeof vi.fn>
    option: ReturnType<typeof vi.fn>
  }> = []
  const constructor = vi.fn(function (_element: HTMLElement, _options: unknown) {
    void _element
    void _options
    const instance = { destroy: vi.fn(), option: vi.fn() }
    instances.push(instance)
    return instance
  })
  return { constructor, instances }
})

vi.mock('sortablejs', () => ({ default: sortable.constructor }))

const task: Task = {
  id: 11,
  project_id: 1,
  title: 'Readable task title',
  description: null,
  status: 'todo',
  priority: 'medium',
  assignee_id: null,
  sort_order: 1,
  comment_count: 0,
  created_at: '2026-07-24T08:30:00Z',
}

const secondTask: Task = {
  ...task,
  id: 12,
  title: 'Second task',
  sort_order: 2,
}

function mountColumn(
  props: { status?: 'todo' | 'in_progress' | 'done'; disabled?: boolean; busy?: boolean; tasks?: Task[] } = {},
  slots = {},
  attrs = {},
) {
  return mount(KanbanColumn, {
    props: {
      status: props.status ?? 'todo',
      tasks: props.tasks ?? [task],
      disabled: props.disabled ?? false,
      busy: props.busy ?? false,
    },
    slots,
    attrs,
  })
}

function sortableOptions() {
  return sortable.constructor.mock.calls.at(-1)?.[1] as {
    animation: number
    disabled: boolean
    draggable: string
    group: { name: string; pull: boolean; put: boolean }
    onEnd: (event: unknown) => void
  }
}

describe('KanbanColumn', () => {
  beforeEach(() => {
    sortable.constructor.mockClear()
    sortable.instances.length = 0
  })

  it('renders status hooks and stable task ids, and mounts Sortable on the real list', () => {
    const wrapper = mountColumn()
    const root = wrapper.get('[data-kanban-column]')
    const list = wrapper.get('[data-kanban-list]')

    expect(root.attributes('data-status')).toBe('todo')
    expect(list.attributes('data-status')).toBe('todo')
    expect(wrapper.find('[data-task-id="11"]').exists()).toBe(true)
    expect(sortable.constructor).toHaveBeenCalledExactlyOnceWith(list.element, expect.any(Object))
  })

  it('configures cross-column grouping, animation, draggable selector, and effective disabled state', () => {
    mountColumn({ busy: true })

    expect(sortableOptions()).toMatchObject({
      group: { name: 'teamflow-board', pull: true, put: true },
      animation: 150,
      disabled: true,
      draggable: '[data-kanban-task]',
    })
  })

  it('translates a valid Sortable end event into a move payload', () => {
    const wrapper = mountColumn()
    const item = document.createElement('article')
    const from = document.createElement('div')
    const to = document.createElement('div')
    item.dataset.taskId = '11'
    from.dataset.status = 'todo'
    to.dataset.status = 'done'

    sortableOptions().onEnd({ item, from, to, newIndex: 2 })

    expect(wrapper.emitted('move')).toEqual([[
      { taskId: 11, from: 'todo', to: 'done', newIndex: 2 },
    ]])
  })

  it('restores a same-column Sortable DOM move before emitting and prefers draggable indexes', () => {
    let idsAtEmit: string[] = []
    const wrapper = mountColumn(
      { tasks: [task, secondTask] },
      {},
      { onMove: () => { idsAtEmit = taskIds(wrapper.get('[data-kanban-list]').element) } },
    )
    const list = wrapper.get('[data-kanban-list]').element
    const item = list.querySelector<HTMLElement>('[data-task-id="11"]')!
    list.append(item)
    expect(taskIds(list)).toEqual(['12', '11'])

    sortableOptions().onEnd({
      item,
      from: list,
      to: list,
      oldDraggableIndex: 0,
      newDraggableIndex: 1,
      oldIndex: 0,
      newIndex: 9,
    })

    expect(idsAtEmit).toEqual(['11', '12'])
    expect(taskIds(list)).toEqual(['11', '12'])
    expect(wrapper.emitted('move')).toEqual([[
      { taskId: 11, from: 'todo', to: 'todo', newIndex: 1 },
    ]])
  })

  it('restores a cross-column Sortable DOM move before emitting when the parent does not update props', () => {
    let sourceIdsAtEmit: string[] = []
    let targetIdsAtEmit: string[] = []
    const source = mountColumn(
      { status: 'todo', tasks: [task, secondTask] },
      {},
      {
        onMove: () => {
          sourceIdsAtEmit = taskIds(source.get('[data-kanban-list]').element)
          targetIdsAtEmit = taskIds(target.get('[data-kanban-list]').element)
        },
      },
    )
    const targetTask = { ...task, id: 21, title: 'Target', status: 'done' as const }
    const target = mountColumn({ status: 'done', tasks: [targetTask] })
    const sourceList = source.get('[data-kanban-list]').element
    const targetList = target.get('[data-kanban-list]').element
    const item = sourceList.querySelector<HTMLElement>('[data-task-id="11"]')!
    targetList.append(item)

    sortableOptionsFor(source).onEnd({
      item,
      from: sourceList,
      to: targetList,
      oldDraggableIndex: 0,
      newDraggableIndex: 1,
    })

    expect(sourceIdsAtEmit).toEqual(['11', '12'])
    expect(targetIdsAtEmit).toEqual(['21'])
    expect(taskIds(sourceList)).toEqual(['11', '12'])
    expect(taskIds(targetList)).toEqual(['21'])
  })

  it('restores a real dragged item even when the pointer event is invalid and does not emit', () => {
    const wrapper = mountColumn({ tasks: [task, secondTask] })
    const list = wrapper.get('[data-kanban-list]').element
    const item = list.querySelector<HTMLElement>('[data-task-id="11"]')!
    list.append(item)

    expect(() => sortableOptions().onEnd({
      item,
      from: list,
      to: list,
      oldIndex: 0,
      newDraggableIndex: -1,
    })).not.toThrow()

    expect(taskIds(list)).toEqual(['11', '12'])
    expect(wrapper.emitted('move')).toBeUndefined()
  })

  it.each([
    ['missing task id', undefined, 'todo', 'done', 0],
    ['unsafe task id', String(Number.MAX_SAFE_INTEGER + 1), 'todo', 'done', 0],
    ['invalid source', '11', 'invalid', 'done', 0],
    ['invalid target', '11', 'todo', 'invalid', 0],
    ['missing index', '11', 'todo', 'done', undefined],
    ['negative index', '11', 'todo', 'done', -1],
  ])('ignores %s without throwing', (_label, taskId, fromStatus, toStatus, newIndex) => {
    const wrapper = mountColumn()
    const item = document.createElement('article')
    const from = document.createElement('div')
    const to = document.createElement('div')
    if (taskId !== undefined) item.dataset.taskId = taskId
    from.dataset.status = fromStatus
    to.dataset.status = toStatus

    expect(() => sortableOptions().onEnd({ item, from, to, newIndex })).not.toThrow()
    expect(wrapper.emitted('move')).toBeUndefined()
  })

  it('updates the existing instance when disabled or busy changes without rebuilding', async () => {
    const wrapper = mountColumn()
    const instance = sortable.instances[0]!

    await wrapper.setProps({ disabled: true })
    await nextTick()
    expect(instance.option).toHaveBeenLastCalledWith('disabled', true)

    await wrapper.setProps({ disabled: false, busy: true })
    await nextTick()
    expect(instance.option).toHaveBeenLastCalledWith('disabled', true)

    await wrapper.setProps({ busy: false })
    await nextTick()
    expect(instance.option).toHaveBeenLastCalledWith('disabled', false)
    expect(sortable.constructor).toHaveBeenCalledOnce()
  })

  it('destroys the Sortable instance exactly once on unmount', () => {
    const wrapper = mountColumn()
    const instance = sortable.instances[0]!

    wrapper.unmount()

    expect(instance.destroy).toHaveBeenCalledOnce()
  })

  it('renders the fallback title and supports a scoped task slot', () => {
    const fallback = mountColumn()
    expect(fallback.text()).toContain('Readable task title')

    const slotted = mountColumn({}, {
      task: ({ task: slotTask }: { task: Task }) => `Custom ${slotTask.id}`,
    })
    expect(slotted.text()).toContain('Custom 11')
    expect(slotted.text()).not.toContain('Readable task title')
  })

  it('keeps an empty drop list with quiet empty, busy, and disabled semantics', () => {
    const wrapper = mountColumn({ tasks: [], disabled: true, busy: true })

    expect(wrapper.find('[data-kanban-list]').exists()).toBe(true)
    expect(wrapper.get('[data-empty-state]').text().length).toBeGreaterThan(0)
    expect(wrapper.get('[data-kanban-column]').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('[data-kanban-list]').attributes('aria-disabled')).toBe('true')
  })

  it('uses neutral list semantics, focusability, and a hidden keyboard description', () => {
    const wrapper = mountColumn({ tasks: [task, secondTask] })
    const items = wrapper.findAll('[data-kanban-task]')

    expect(wrapper.get('[data-kanban-list]').attributes('role')).toBe('list')
    expect(items).toHaveLength(2)
    expect(items[0]?.element.tagName).toBe('DIV')
    expect(items[0]?.attributes('role')).toBe('listitem')
    expect(items[0]?.attributes('tabindex')).toBe('0')
    expect(items[0]?.attributes('aria-keyshortcuts')).toContain('Alt+ArrowUp')
    const descriptionId = items[0]?.attributes('aria-describedby')
    expect(descriptionId).toBeTruthy()
    const description = wrapper.get(`#${descriptionId}`)
    expect(description.classes()).toContain('sr-only')
    expect(description.text()).toBe('按住 Alt 键并使用方向键移动此任务。')
    expect(description.text()).not.toContain('Hold Alt')
  })

  it.each(['button', 'input'] as const)(
    'ignores Alt+Arrow events bubbling from a slotted %s control',
    (control) => {
      const wrapper = mountColumn(
        { tasks: [task, secondTask] },
        {
          task: '<button data-task-button type="button">Open</button><input data-task-input value="Edit">',
        },
      )
      const event = keyboardEvent('ArrowDown')

      wrapper.get(`[data-task-${control}]`).element.dispatchEvent(event)

      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(wrapper.emitted('move')).toBeUndefined()
    },
  )

  it.each([
    ['up', 1, 'ArrowUp', { taskId: 12, from: 'todo', to: 'todo', newIndex: 0 }],
    ['down', 0, 'ArrowDown', { taskId: 11, from: 'todo', to: 'todo', newIndex: 1 }],
  ] as const)('emits an equivalent keyboard move %s within the column', (_direction, taskIndex, key, payload) => {
    const wrapper = mountColumn({ tasks: [task, secondTask] })
    const event = keyboardEvent(key)

    wrapper.findAll('[data-kanban-task]')[taskIndex]?.element.dispatchEvent(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(wrapper.emitted('move')).toEqual([[payload]])
  })

  it.each([
    ['left', 'in_progress', 'ArrowLeft', 'todo'],
    ['right', 'in_progress', 'ArrowRight', 'done'],
  ] as const)('moves %s to the adjacent keyboard column at index zero', (_direction, status, key, targetStatus) => {
    const wrapper = mountColumn({ status, tasks: [{ ...task, status }] })
    const event = keyboardEvent(key)

    wrapper.get('[data-kanban-task]').element.dispatchEvent(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(wrapper.emitted('move')).toEqual([[
      { taskId: 11, from: status, to: targetStatus, newIndex: 0 },
    ]])
  })

  it.each([
    ['first task up', { status: 'todo' as const, tasks: [task] }, 'ArrowUp'],
    ['last task down', { status: 'todo' as const, tasks: [task] }, 'ArrowDown'],
    ['leftmost column left', { status: 'todo' as const, tasks: [task] }, 'ArrowLeft'],
    ['rightmost column right', { status: 'done' as const, tasks: [{ ...task, status: 'done' as const }] }, 'ArrowRight'],
  ])('does not consume or emit for the keyboard boundary: %s', (_label, props, key) => {
    const wrapper = mountColumn(props)
    const event = keyboardEvent(key)

    wrapper.get('[data-kanban-task]').element.dispatchEvent(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(wrapper.emitted('move')).toBeUndefined()
  })

  it.each([
    ['disabled', { disabled: true }],
    ['busy', { busy: true }],
  ])('removes tasks from tab order and ignores keyboard moves while %s', (_label, blockedProps) => {
    const wrapper = mountColumn({ tasks: [task, secondTask], ...blockedProps })
    const event = keyboardEvent('ArrowDown')

    expect(wrapper.get('[data-kanban-task]').attributes('tabindex')).toBe('-1')
    wrapper.get('[data-kanban-task]').element.dispatchEvent(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(wrapper.emitted('move')).toBeUndefined()
  })
})

function taskIds(list: Element): string[] {
  return Array.from(list.querySelectorAll(':scope > [data-kanban-task]'))
    .map(element => (element as HTMLElement).dataset.taskId ?? '')
}

function sortableOptionsFor(wrapper: ReturnType<typeof mountColumn>) {
  const list = wrapper.get('[data-kanban-list]').element
  const call = sortable.constructor.mock.calls.find(([element]) => element === list)
  return call?.[1] as ReturnType<typeof sortableOptions>
}

function keyboardEvent(key: string) {
  const event = new KeyboardEvent('keydown', {
    key,
    altKey: true,
    bubbles: true,
    cancelable: true,
  })
  vi.spyOn(event, 'preventDefault')
  return event as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> }
}
