import ElementPlus, { ElDialog, ElSelect, type FormInstance } from 'element-plus'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectMember } from '@/types/project'
import type { Task, TaskStatus } from '@/types/task'

import TaskDialog from './TaskDialog.vue'

const members: ProjectMember[] = [
  { user_id: 7, username: '小林', email: 'lin@example.com', role: 'owner' },
  { user_id: 9, username: '阿九', email: 'nine@example.com', role: 'member' },
]
const taskA: Task = {
  id: 11, project_id: 1, title: '任务 A', description: '说明 A', status: 'in_progress',
  priority: 'high', assignee_id: 7, sort_order: 1, comment_count: 2, created_at: '2026-07-24T08:30:00Z',
}
const taskB: Task = {
  ...taskA, id: 12, title: '任务 B', description: null, status: 'done', priority: 'low', assignee_id: null,
}

async function mountDialog(props: Partial<InstanceType<typeof TaskDialog>['$props']> = {}) {
  const wrapper = mount(TaskDialog, {
    attachTo: document.body,
    props: {
      modelValue: true,
      task: null,
      members,
      defaultStatus: 'todo',
      submitting: false,
      error: null,
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return wrapper
}

async function setInput(wrapper: VueWrapper, name: string, value: string) {
  await wrapper.get(`[name="${name}"]`).setValue(value)
}

function selects(wrapper: VueWrapper) {
  return wrapper.findAllComponents(ElSelect)
}

async function setSelect(wrapper: VueWrapper, index: number, value: unknown) {
  selects(wrapper)[index]?.vm.$emit('update:modelValue', value)
  await wrapper.vm.$nextTick()
}

async function submit(wrapper: VueWrapper) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function exposedForm(wrapper: VueWrapper): FormInstance {
  const component = wrapper.findComponent({ name: 'ElForm' })
  const internal = component.vm as unknown as { $: { exposed: FormInstance | null } }
  if (!internal.$.exposed) throw new Error('Expected ElForm exposed instance')
  return internal.$.exposed
}

describe('TaskDialog', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('initializes create mode on every open with the requested defaults', async () => {
    const wrapper = await mountDialog({ defaultStatus: 'done' })
    expect(wrapper.findComponent(ElDialog).props('title')).toBe('新建任务')
    expect(wrapper.get('input[name="title"]').element).toHaveProperty('value', '')
    expect(wrapper.get('textarea[name="description"]').element).toHaveProperty('value', '')
    expect(selects(wrapper).map(select => select.props('modelValue'))).toEqual(['done', 'medium', null])

    await setInput(wrapper, 'title', '陈旧标题')
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(wrapper.get('input[name="title"]').element).toHaveProperty('value', '')
    expect(selects(wrapper).map(select => select.props('modelValue'))).toEqual(['done', 'medium', null])
  })

  it('initializes edit exactly and replaces state when task identity or mode changes', async () => {
    const wrapper = await mountDialog({ task: taskA })
    expect(wrapper.findComponent(ElDialog).props('title')).toBe('编辑任务')
    expect(wrapper.get('input[name="title"]').element).toHaveProperty('value', '任务 A')
    expect(wrapper.get('textarea[name="description"]').element).toHaveProperty('value', '说明 A')
    expect(selects(wrapper).map(select => select.props('modelValue'))).toEqual(['in_progress', 'high', 7])

    await setInput(wrapper, 'title', '未保存内容')
    await wrapper.setProps({ task: taskB })
    await flushPromises()
    expect(wrapper.get('input[name="title"]').element).toHaveProperty('value', '任务 B')
    expect(wrapper.get('textarea[name="description"]').element).toHaveProperty('value', '')
    expect(selects(wrapper).map(select => select.props('modelValue'))).toEqual(['done', 'low', null])

    await wrapper.setProps({ task: null, defaultStatus: 'in_progress' })
    await flushPromises()
    expect(wrapper.get('input[name="title"]').element).toHaveProperty('value', '')
    expect(selects(wrapper).map(select => select.props('modelValue'))).toEqual(['in_progress', 'medium', null])
  })

  it('refreshes dirty edit state from same-id external task field changes', async () => {
    const wrapper = await mountDialog({ task: taskA, error: '旧提交错误' })
    await setInput(wrapper, 'title', '   ')
    await submit(wrapper)
    expect(wrapper.find('#task-field-error-title').exists()).toBe(true)

    await setInput(wrapper, 'title', '本地未保存标题')
    await setInput(wrapper, 'description', '本地未保存说明')
    await setSelect(wrapper, 1, 'low')
    await setSelect(wrapper, 2, 9)

    const updatedTask: Task = {
      ...taskA,
      title: '服务端新标题',
      description: '服务端新说明',
      status: 'done',
      priority: 'medium',
      assignee_id: 9,
    }
    await wrapper.setProps({ task: updatedTask, error: null })
    await flushPromises()

    expect(wrapper.get('input[name="title"]').element).toHaveProperty('value', '服务端新标题')
    expect(wrapper.get('textarea[name="description"]').element).toHaveProperty('value', '服务端新说明')
    expect(selects(wrapper).map(select => select.props('modelValue'))).toEqual(['done', 'medium', 9])
    expect(wrapper.find('#task-field-error-title').exists()).toBe(false)
    expect(wrapper.find('[data-testid="form-error"]').exists()).toBe(false)

    await submit(wrapper)
    expect(wrapper.emitted('submit')).toEqual([[
      {
        title: '服务端新标题',
        description: '服务端新说明',
        status: 'done',
        priority: 'medium',
        assignee_id: 9,
      },
    ]])
  })

  it('emits an exact payload while preserving title and nonblank description input', async () => {
    const wrapper = await mountDialog()
    await setInput(wrapper, 'title', '  原样标题  ')
    await setInput(wrapper, 'description', '  原样说明  ')
    await setSelect(wrapper, 0, 'in_progress')
    await setSelect(wrapper, 1, 'low')
    await setSelect(wrapper, 2, 9)
    await submit(wrapper)

    expect(wrapper.emitted('submit')).toEqual([[
      { title: '  原样标题  ', description: '  原样说明  ', status: 'in_progress', priority: 'low', assignee_id: 9 },
    ]])
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it.each(['', '  ', '\n\t'])('normalizes blank description %j to null', async (description) => {
    const wrapper = await mountDialog()
    await setInput(wrapper, 'title', '任务')
    await setInput(wrapper, 'description', description)
    await submit(wrapper)
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ description: null, assignee_id: null })
  })

  it('uses Unicode code points without a native maxlength', async () => {
    const wrapper = await mountDialog()
    const titleInput = wrapper.get('input[name="title"]')
    expect(titleInput.attributes()).not.toHaveProperty('maxlength')

    await setInput(wrapper, 'title', '😀'.repeat(200))
    await submit(wrapper)
    expect(wrapper.emitted('submit')).toHaveLength(1)

    await wrapper.setProps({ submitting: true })
    await wrapper.setProps({ submitting: false })
    await setInput(wrapper, 'title', '😀'.repeat(201))
    await submit(wrapper)
    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.get('#task-field-error-title').text()).toContain('200')
  })

  it.each(['', '   ', '\n\t'])('rejects blank title %j, focuses it, and sets native ARIA', async (title) => {
    const wrapper = await mountDialog()
    await setInput(wrapper, 'title', title)
    await submit(wrapper)
    const input = wrapper.get('input[name="title"]')

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(document.activeElement).toBe(input.element)
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe('task-field-error-title')
  })

  it('locks fields, duplicate submission, and every close path from the external submitting prop', async () => {
    const wrapper = await mountDialog({ submitting: true })
    expect(wrapper.findComponent(ElDialog).props('closeOnClickModal')).toBe(false)
    expect(wrapper.findComponent(ElDialog).props('closeOnPressEscape')).toBe(false)
    expect(wrapper.findComponent(ElDialog).props('showClose')).toBe(false)
    expect(wrapper.findAll('input, textarea, button').every(control => control.attributes('disabled') !== undefined)).toBe(true)

    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    wrapper.findComponent(ElDialog).vm.$emit('update:modelValue', false)
    await wrapper.get('[data-testid="dialog-cancel"]').trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('ignores an initial external submitting cycle when no emitted submission is pending', async () => {
    const wrapper = await mountDialog({ submitting: true })
    await wrapper.setProps({ submitting: false })
    await setInput(wrapper, 'title', '首次本地提交')

    await submit(wrapper)
    await submit(wrapper)
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('keeps the local lock across ticks until the parent completes a true-to-false cycle', async () => {
    const wrapper = await mountDialog()
    await setInput(wrapper, 'title', '只提交一次')

    await submit(wrapper)
    await wrapper.vm.$nextTick()
    await flushPromises()
    await submit(wrapper)
    expect(wrapper.emitted('submit')).toHaveLength(1)

    await wrapper.setProps({ submitting: true })
    await wrapper.setProps({ submitting: false })
    await submit(wrapper)
    await flushPromises()
    expect(wrapper.emitted('submit')).toHaveLength(2)
  })

  it('unlocks a new generation on reopen or task identity change', async () => {
    const create = await mountDialog()
    await setInput(create, 'title', '第一轮')
    await submit(create)
    await create.setProps({ modelValue: false })
    await create.setProps({ modelValue: true })
    await setInput(create, 'title', '重新打开')
    await submit(create)
    expect(create.emitted('submit')).toHaveLength(2)

    const edit = await mountDialog({ task: taskA })
    await submit(edit)
    await edit.setProps({ task: taskB })
    await submit(edit)
    expect(edit.emitted('submit')).toHaveLength(2)
  })

  it('does not carry an observed parent submission cycle into a new generation', async () => {
    const wrapper = await mountDialog({ task: taskA })
    await submit(wrapper)
    await wrapper.setProps({ submitting: true })
    await wrapper.setProps({ task: taskB })
    await wrapper.setProps({ submitting: false })

    await submit(wrapper)
    await flushPromises()
    await submit(wrapper)
    expect(wrapper.emitted('submit')).toHaveLength(2)
  })

  it('assigns delayed parent cycles to emitted generations in order', async () => {
    const wrapper = await mountDialog({ task: taskA })
    await submit(wrapper)

    await wrapper.setProps({ task: taskB })
    await submit(wrapper)
    expect(wrapper.emitted('submit')).toHaveLength(2)

    await wrapper.setProps({ submitting: true })
    await wrapper.setProps({ submitting: false })
    await submit(wrapper)
    expect(wrapper.emitted('submit')).toHaveLength(2)

    await wrapper.setProps({ submitting: true })
    await wrapper.setProps({ submitting: false })
    await submit(wrapper)
    expect(wrapper.emitted('submit')).toHaveLength(3)
  })

  it('ignores a stale validation result without blocking validation and ARIA in the new task', async () => {
    const wrapper = await mountDialog({ task: taskA })
    const oldValidation = deferred<boolean>()
    const validate = vi.spyOn(exposedForm(wrapper), 'validate')
      .mockReturnValueOnce(oldValidation.promise)
      .mockResolvedValue(true)

    void wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(validate).toHaveBeenCalledOnce()
    await wrapper.setProps({ task: taskB })
    oldValidation.resolve(true)
    await flushPromises()

    await setInput(wrapper, 'title', '   ')
    await submit(wrapper)
    const input = wrapper.get('input[name="title"]')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(input.element)

    await setInput(wrapper, 'title', '新任务有效标题')
    await submit(wrapper)
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('does not let an old validation settlement clear a newer validation or submit lock', async () => {
    const wrapper = await mountDialog({ task: taskA })
    const oldValidation = deferred<boolean>()
    const newValidation = deferred<boolean>()
    vi.spyOn(exposedForm(wrapper), 'validate')
      .mockReturnValueOnce(oldValidation.promise)
      .mockReturnValueOnce(newValidation.promise)

    void wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.setProps({ task: taskB })
    void wrapper.get('form').trigger('submit')
    await flushPromises()

    oldValidation.resolve(true)
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    newValidation.resolve(true)
    await flushPromises()
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('shows parent error as text, keeps input, and allows unlocked close', async () => {
    const wrapper = await mountDialog({ error: '<b>提交失败，请重试</b>' })
    await setInput(wrapper, 'title', '保留输入')
    expect(wrapper.get('[data-testid="form-error"]').text()).toBe('<b>提交失败，请重试</b>')
    expect(wrapper.find('[data-testid="form-error"] b').exists()).toBe(false)

    wrapper.findComponent(ElDialog).vm.$emit('update:modelValue', false)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(wrapper.get('input[name="title"]').element).toHaveProperty('value', '保留输入')
  })

  it('offers only real status, priority, and member ids', async () => {
    const wrapper = await mountDialog()
    const values = wrapper.findAllComponents({ name: 'ElOption' }).map(option => option.props('value'))
    expect(values).toEqual(['todo', 'in_progress', 'done', 'low', 'medium', 'high', 7, 9])
    expect(values).not.toContain(0)
    expect(values).not.toContain('')
  })

  it.each(['todo', 'in_progress', 'done'] as TaskStatus[])('reacts to create default status changes: %s', async (status) => {
    const wrapper = await mountDialog({ defaultStatus: 'todo' })
    await wrapper.setProps({ defaultStatus: status })
    await flushPromises()
    expect(selects(wrapper)[0]?.props('modelValue')).toBe(status)
  })

  it('does not reset unsaved edit fields when defaultStatus changes', async () => {
    const wrapper = await mountDialog({ task: taskA, defaultStatus: 'todo' })
    await setInput(wrapper, 'title', '未保存标题')
    await setInput(wrapper, 'description', '未保存说明')
    await setSelect(wrapper, 1, 'low')
    await setSelect(wrapper, 2, 9)

    await wrapper.setProps({ defaultStatus: 'done' })
    await flushPromises()

    expect(wrapper.get('input[name="title"]').element).toHaveProperty('value', '未保存标题')
    expect(wrapper.get('textarea[name="description"]').element).toHaveProperty('value', '未保存说明')
    expect(selects(wrapper).map(select => select.props('modelValue'))).toEqual(['in_progress', 'low', 9])
  })

  it('normalizes an explicit assignee clear to null while preserving an unknown existing id', async () => {
    const unknownAssignee = { ...taskA, assignee_id: 99 }
    const wrapper = await mountDialog({ task: unknownAssignee })
    await submit(wrapper)
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ assignee_id: 99 })

    await wrapper.setProps({ submitting: true })
    await wrapper.setProps({ submitting: false })
    selects(wrapper)[2]?.vm.$emit('update:modelValue', undefined)
    await wrapper.vm.$nextTick()
    await submit(wrapper)
    expect(wrapper.emitted('submit')?.[1]?.[0]).toMatchObject({ assignee_id: null })
  })
})
