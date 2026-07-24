import ElementPlus from 'element-plus'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import type { ApiError } from '@/types/auth'
import type { ProjectListItem } from '@/types/project'

import ProjectList from './ProjectList.vue'

const projects: ProjectListItem[] = [
  {
    id: 11,
    name: 'Alpha 项目',
    description: '跨团队交付与评审',
    owner_id: 7,
    invite_code: 'ALPHA11',
    created_at: '2026-07-24T08:00:00Z',
    role: 'owner',
  },
  {
    id: 12,
    name: 'Beta'.repeat(30),
    description: null,
    owner_id: 8,
    invite_code: 'BETA12',
    created_at: '2026-07-20T08:00:00Z',
    role: 'admin',
  },
  {
    id: 13,
    name: 'Gamma',
    description: '描述'.repeat(160),
    owner_id: 9,
    invite_code: 'GAMMA13',
    created_at: '2026-07-18T08:00:00Z',
    role: 'member',
  },
]

const loadError: ApiError = {
  status: 500,
  code: 'internal_error',
  message: 'SQL connection failed',
  details: [],
}

function mountList(props: Partial<InstanceType<typeof ProjectList>['$props']> = {}) {
  return mount(ProjectList, {
    props: {
      projects: [],
      loading: false,
      loaded: false,
      error: null,
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
}

describe('ProjectList', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows a stable loading state and the real current count', () => {
    const wrapper = mountList({ projects: [projects[0]], loading: true })

    expect(wrapper.get('h2').text()).toBe('我的项目')
    expect(wrapper.get('[data-testid="project-count"]').text()).toContain('1')
    expect(wrapper.get('[role="status"]').text()).toContain('正在加载项目')
    expect(wrapper.findAll('[data-testid="project-placeholder"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="project-item"]')).toHaveLength(0)
  })

  it('shows a safe first-load failure and emits retry', async () => {
    const wrapper = mountList({ error: loadError })

    expect(wrapper.get('[role="alert"]').text()).toContain('无法加载项目')
    expect(wrapper.text()).not.toContain('SQL connection')
    await wrapper.get('[data-testid="project-retry"]').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('shows the honest loaded empty state with create and join commands', async () => {
    const wrapper = mountList({ loaded: true })

    expect(wrapper.text()).toContain('还没有项目')
    expect(wrapper.get('[data-testid="project-count"]').text()).toContain('0')
    await wrapper.get('[data-testid="empty-create"]').trigger('click')
    await wrapper.get('[data-testid="empty-join"]').trigger('click')
    expect(wrapper.emitted('create')).toHaveLength(1)
    expect(wrapper.emitted('join')).toHaveLength(1)
  })

  it('renders real project data, Chinese roles, dates, and no invented statistics', () => {
    const wrapper = mountList({ projects, loaded: true })
    const items = wrapper.findAll('[data-testid="project-item"]')

    expect(items).toHaveLength(3)
    expect(wrapper.get('[data-testid="project-count"]').text()).toContain('3')
    expect(items[0].text()).toContain('Alpha 项目')
    expect(items[0].text()).toContain('跨团队交付与评审')
    expect(items[0].text()).toContain('负责人')
    expect(items[0].text()).toContain('2026-07-24')
    expect(items[1].text()).toContain('暂无描述')
    expect(items[1].text()).toContain('管理员')
    expect(items[2].text()).toContain('成员')
    expect(wrapper.text()).not.toMatch(/完成率|任务数|活跃度/)
  })

  it('uses one non-nested interactive entry per project and emits select', async () => {
    const wrapper = mountList({ projects, loaded: true })
    const firstItem = wrapper.findAll('[data-testid="project-item"]')[0]
    const entry = firstItem.get('button')

    expect(firstItem.findAll('button, a')).toHaveLength(1)
    expect(entry.attributes('aria-label')).toBe('打开项目：Alpha 项目')
    const describedBy = entry.attributes('aria-describedby')
    expect(describedBy).toBe(
      'project-11-description project-11-role project-11-created-at',
    )
    if (!describedBy) {
      throw new Error('Expected project entry metadata references')
    }
    const describedText = describedBy
      .split(' ')
      .map(id => wrapper.get(`#${id}`).text())
      .join(' ')
    expect(describedText).toContain('跨团队交付与评审')
    expect(describedText).toContain('负责人')
    expect(describedText).toContain('2026-07-24')
    await entry.trigger('click')
    expect(wrapper.emitted('select')).toEqual([[11]])
  })

  it('uses project-id metadata references to distinguish same-name projects', () => {
    const sameNameProjects = [
      projects[0],
      { ...projects[1], name: projects[0].name },
    ]
    const wrapper = mountList({ projects: sameNameProjects, loaded: true })
    const entries = wrapper.findAll('[data-testid="project-item"] button')

    expect(entries[0].attributes('aria-label')).toBe(entries[1].attributes('aria-label'))
    const firstDescribedBy = entries[0].attributes('aria-describedby')
    const secondDescribedBy = entries[1].attributes('aria-describedby')
    expect(firstDescribedBy).not.toBe(secondDescribedBy)
    expect(secondDescribedBy).toContain('project-12-')
    if (!secondDescribedBy) {
      throw new Error('Expected second project metadata references')
    }
    const secondDescriptionId = secondDescribedBy.split(' ')[0]
    expect(wrapper.get(`#${secondDescriptionId}`).text()).toBe('暂无描述')
  })

  it('keeps a confirmed list visible during refresh errors', () => {
    const wrapper = mountList({ projects, loaded: true, error: loadError })

    expect(wrapper.findAll('[data-testid="project-item"]')).toHaveLength(3)
    expect(wrapper.get('[data-testid="refresh-error"]').text()).toContain('刷新项目失败')
    expect(wrapper.text()).not.toContain('SQL connection')
  })
})
