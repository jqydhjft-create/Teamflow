import ElementPlus from 'element-plus'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectMember } from '@/types/project'
import type { Task } from '@/types/task'

import TaskCard from './TaskCard.vue'

const members: ProjectMember[] = [
  { user_id: 7, username: '小林', email: 'lin@example.com', role: 'owner' },
]
const task: Task = {
  id: 11,
  project_id: 1,
  title: '<script>alert(1)</script>非常长的任务标题WithoutAnyBreakPoint'.repeat(3),
  description: '绝不能出现在卡片里的描述 <b>secret</b>',
  status: 'todo',
  priority: 'high',
  assignee_id: 7,
  sort_order: 1,
  comment_count: 4,
  created_at: '2026-07-24T08:30:00Z',
}

function mountCard(
  props: Partial<InstanceType<typeof TaskCard>['$props']> = {},
  attachTo?: Element,
) {
  return mount(TaskCard, {
    props: { task, members, busy: false, ...props },
    attachTo,
    global: { plugins: [ElementPlus] },
  })
}

describe('TaskCard', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('renders escaped title in a stable overflow structure and omits description', () => {
    const wrapper = mountCard()
    const title = wrapper.get('[data-testid="task-title"]')

    expect(wrapper.element.tagName).toBe('ARTICLE')
    expect(title.text()).toBe(task.title)
    expect(title.classes()).toContain('task-card__title')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('绝不能出现在卡片里的描述')
  })

  it.each([
    ['low', '低'],
    ['medium', '中'],
    ['high', '高'],
  ] as const)('shows %s priority with a swatch and text', (priority, label) => {
    const wrapper = mountCard({ task: { ...task, priority } })
    expect(wrapper.get('[data-testid="priority-swatch"]').classes()).toContain(`task-card__swatch--${priority}`)
    expect(wrapper.get('[data-testid="task-priority"]').text()).toContain(label)
  })

  it.each([
    [7, '小林'],
    [null, '未分配'],
    [99, '未知成员'],
  ] as const)('resolves assignee %s honestly', (assigneeId, expected) => {
    expect(mountCard({ task: { ...task, assignee_id: assigneeId } }).text()).toContain(expected)
  })

  it.each([
    [{ user_id: 8, username: '', email: 'fallback@example.com', role: 'member' as const }, 'fallback@example.com'],
    [{ user_id: 8, username: '', email: '', role: 'member' as const }, '未知成员'],
  ])('falls back from an empty member username to an honest label', (member, expected) => {
    const wrapper = mountCard({ task: { ...task, assignee_id: 8 }, members: [member] })
    expect(wrapper.text()).toContain(expected)
  })

  it('shows an accessible comment count and icon commands with tooltips', () => {
    const wrapper = mountCard()

    expect(wrapper.get('[data-testid="comment-count"]').text()).toBe('4')
    expect(wrapper.get('[data-testid="comment-count"]').attributes('aria-label')).toBe('4 条评论')
    expect(wrapper.get('[data-testid="edit-task"]').attributes('aria-label')).toBe(`编辑任务：${task.title}`)
    expect(wrapper.get('[data-testid="delete-task"]').attributes('aria-label')).toBe(`删除任务：${task.title}`)
    const tooltips = wrapper.findAllComponents({ name: 'ElTooltip' })
    expect(tooltips.map(tooltip => tooltip.props('content'))).toEqual(['编辑任务', '删除任务'])
    expect(wrapper.get('[data-testid="edit-task"]').text()).toBe('')
    expect(wrapper.get('[data-testid="delete-task"]').text()).toBe('')
  })

  it('renders the comment icon without requiring a global ElIcon component', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const wrapper = mount(TaskCard, {
      props: { task, members, busy: false },
      global: {
        stubs: {
          ElButton: { template: '<button><slot /></button>' },
          ElTooltip: { template: '<span><slot /></span>' },
        },
      },
    })

    const comments = wrapper.get('[data-testid="comment-count"]')
    expect(warn.mock.calls.flat().join(' ')).not.toContain('Failed to resolve component: el-icon')
    expect(comments.text()).toBe('4')
    expect(comments.get('svg').attributes('aria-hidden')).toBe('true')
  })

  it('emits the original task for edit and delete', async () => {
    const wrapper = mountCard()
    await wrapper.get('[data-testid="edit-task"]').trigger('click')
    await wrapper.get('[data-testid="delete-task"]').trigger('click')
    expect(wrapper.emitted('edit')).toEqual([[task]])
    expect(wrapper.emitted('delete')).toEqual([[task]])
  })

  it('stops drag-start events in the command area without blocking command clicks', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = mountCard({}, host)
    const commands = wrapper.get('.task-card__commands')
    const edit = wrapper.get('[data-testid="edit-task"]')
    const deleteButton = wrapper.get('[data-testid="delete-task"]')

    for (const [eventName, target] of [
      ['pointerdown', edit],
      ['mousedown', deleteButton],
      ['touchstart', commands],
    ] as const) {
      const parentListener = vi.fn()
      host.addEventListener(eventName, parentListener)
      await target.trigger(eventName)
      expect(parentListener).not.toHaveBeenCalled()
    }

    const parentClick = vi.fn()
    host.addEventListener('click', parentClick)
    await edit.trigger('click')
    expect(wrapper.emitted('edit')).toEqual([[task]])
    expect(wrapper.emitted('delete')).toBeUndefined()
    await deleteButton.trigger('click')
    expect(wrapper.emitted('delete')).toEqual([[task]])
    expect(parentClick).toHaveBeenCalledTimes(2)
  })

  it('disables commands and emits nothing while busy', async () => {
    const wrapper = mountCard({ busy: true })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons.every(button => button.attributes('disabled') !== undefined)).toBe(true)
    await buttons[0]?.trigger('click')
    await buttons[1]?.trigger('click')
    expect(wrapper.emitted('edit')).toBeUndefined()
    expect(wrapper.emitted('delete')).toBeUndefined()
  })
})
