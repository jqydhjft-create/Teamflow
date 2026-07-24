import ElementPlus, { ElSelect } from 'element-plus'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { ProjectMember } from '@/types/project'

import BoardToolbar from './BoardToolbar.vue'

const members: ProjectMember[] = [
  { user_id: 7, username: '小林', email: 'lin@example.com', role: 'owner' },
  { user_id: 9, username: '', email: 'nine@example.com', role: 'member' },
]

function mountToolbar(props: Partial<InstanceType<typeof BoardToolbar>['$props']> = {}) {
  return mount(BoardToolbar, {
    props: {
      priority: undefined,
      assigneeId: undefined,
      members,
      disabled: false,
      filtersActive: false,
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
}

describe('BoardToolbar', () => {
  it('renders exact priority and member options without sentinel values', () => {
    const wrapper = mountToolbar()
    const selects = wrapper.findAllComponents(ElSelect)

    expect(selects).toHaveLength(2)
    expect(selects[0]?.props('modelValue')).toBeUndefined()
    expect(selects[1]?.props('modelValue')).toBeUndefined()
    expect(selects[0]?.props('clearable')).toBe(true)
    expect(selects[1]?.props('clearable')).toBe(true)

    const options = wrapper.findAllComponents({ name: 'ElOption' }).map(option => option.props())
    expect(options.slice(0, 3).map(({ label, value }) => ({ label, value }))).toEqual([
      { label: '低', value: 'low' },
      { label: '中', value: 'medium' },
      { label: '高', value: 'high' },
    ])
    expect(options.slice(3).map(({ label, value }) => ({ label, value }))).toEqual([
      { label: '小林（lin@example.com）', value: 7 },
      { label: 'nine@example.com', value: 9 },
    ])
    expect(options.some(option => option.value === '' || option.value === 0)).toBe(false)
  })

  it('emits exact valid model values and normalizes every invalid boundary value', async () => {
    const wrapper = mountToolbar()
    const selects = wrapper.findAllComponents(ElSelect)

    selects[0]?.vm.$emit('update:modelValue', 'high')
    selects[1]?.vm.$emit('update:modelValue', 9)
    for (const value of ['', null, undefined, 0, 'urgent']) {
      selects[0]?.vm.$emit('update:modelValue', value)
    }
    for (const value of ['', null, undefined, 0, 8, 99, Number.MAX_SAFE_INTEGER + 1]) {
      selects[1]?.vm.$emit('update:modelValue', value)
    }
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:priority')).toEqual([
      ['high'], [undefined], [undefined], [undefined], [undefined], [undefined],
    ])
    expect(wrapper.emitted('update:assigneeId')).toEqual([
      [9], [undefined], [undefined], [undefined], [undefined], [undefined], [undefined], [undefined],
    ])
  })

  it('configures clear values explicitly at the Element Plus boundary', () => {
    const selects = mountToolbar().findAllComponents(ElSelect)
    const priorityClear = selects[0]?.props('valueOnClear')
    const assigneeClear = selects[1]?.props('valueOnClear')
    expect(priorityClear).toBeTypeOf('function')
    expect(assigneeClear).toBeTypeOf('function')
    expect((priorityClear as () => unknown)()).toBeUndefined()
    expect((assigneeClear as () => unknown)()).toBeUndefined()
  })

  it('emits clear and create commands and exposes stable labels', async () => {
    const wrapper = mountToolbar({ filtersActive: true })

    expect(wrapper.get('[aria-label="优先级筛选"]')).toBeTruthy()
    expect(wrapper.get('[aria-label="负责人筛选"]')).toBeTruthy()
    await wrapper.get('[data-testid="clear-filters"]').trigger('click')
    await wrapper.get('[data-testid="create-task"]').trigger('click')

    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(wrapper.emitted('create')).toHaveLength(1)
    expect(wrapper.get('[data-testid="filter-notice"]').text()).toBe('筛选启用时已暂停拖拽排序。')
  })

  it('hides the notice and disables every control when blocked', async () => {
    const wrapper = mountToolbar({ disabled: true, filtersActive: false })
    const selects = wrapper.findAllComponents(ElSelect)
    const clear = wrapper.get('[data-testid="clear-filters"]')
    const create = wrapper.get('[data-testid="create-task"]')

    expect(wrapper.find('[data-testid="filter-notice"]').exists()).toBe(false)
    expect(selects.every(select => select.props('disabled') === true)).toBe(true)
    expect(clear.attributes()).toHaveProperty('disabled')
    expect(create.attributes()).toHaveProperty('disabled')
    await clear.trigger('click')
    await create.trigger('click')
    expect(wrapper.emitted('clear')).toBeUndefined()
    expect(wrapper.emitted('create')).toBeUndefined()
  })

  it('disables clear when no filters are active', () => {
    const wrapper = mountToolbar({ filtersActive: false })
    expect(wrapper.get('[data-testid="clear-filters"]').attributes()).toHaveProperty('disabled')
  })
})
