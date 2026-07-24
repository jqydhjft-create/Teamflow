import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import LoginView from './LoginView.vue'

const AuthFormStub = {
  template: '<section data-testid="auth-form">Auth form</section>',
}

function mountView() {
  return mount(LoginView, {
    global: {
      stubs: { AuthForm: AuthFormStub },
    },
  })
}

describe('LoginView', () => {
  it('presents the product and account access as distinct semantic regions', () => {
    const wrapper = mountView()

    expect(wrapper.get('main.login-page')).toBeDefined()
    expect(wrapper.get('aside[aria-labelledby="brand-title"]')).toBeDefined()
    expect(wrapper.get('section[aria-labelledby="auth-title"]')).toBeDefined()
    expect(wrapper.get('#brand-title').text()).toBe('TeamFlow')
    expect(wrapper.text()).toContain('工作，自然流动')
    expect(wrapper.text()).toContain('让团队围绕同一节奏，清楚推进每一项工作。')
    expect(wrapper.get('#auth-title').text()).toBe('欢迎回来')
    expect(wrapper.get('[data-testid="auth-form"]')).toBeDefined()
  })

  it('shows a labeled three-column workflow motif without fabricated project data', () => {
    const wrapper = mountView()
    const board = wrapper.get('[aria-labelledby="workflow-title"]')
    const columns = board.findAll('.workflow-column')

    expect(board.get('h2').text()).toBe('工作流一览')
    expect(columns.length).toBeGreaterThanOrEqual(3)
    expect(columns.map(column => column.get('h3').text())).toEqual(expect.arrayContaining(['待开始', '进行中', '已完成']))
    expect(board.findAll('.workflow-bar').length).toBeGreaterThanOrEqual(6)
    expect(wrapper.text()).not.toContain('示例项目')
  })

  it('does not globally hide horizontal overflow', () => {
    const styles = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')

    expect(styles).not.toMatch(/body\s*\{[^}]*overflow-x:\s*hidden/s)
  })
})
