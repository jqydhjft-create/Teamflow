import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  CreateProjectPayload,
  JoinProjectPayload,
  Project,
  ProjectListItem,
  ProjectMember,
  ProjectMembership,
} from '@/types/project'

import { ApiProtocolError } from './errors'
import { http } from './http'
import {
  createProject,
  getProject,
  joinProject,
  listProjectMembers,
  listProjects,
} from './projects'

vi.mock('./http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const project: Project = {
  id: 11,
  name: 'Launch plan',
  description: 'Coordinate the release.',
  owner_id: 7,
  invite_code: 'JOIN42',
  created_at: '2026-07-24T08:00:00Z',
}

const projectListItem: ProjectListItem = {
  ...project,
  role: 'owner',
}

const projectMember: ProjectMember = {
  user_id: 7,
  username: 'alice',
  email: 'alice@example.com',
  role: 'owner',
}

const membership: ProjectMembership = {
  project_id: 11,
  user_id: 9,
  role: 'member',
}

const supplementaryCharacter = '\u{1F680}'

describe('projects API', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('lists projects and unwraps the items collection', async () => {
    vi.mocked(http.get).mockResolvedValue({
      data: { code: 200, data: { items: [projectListItem] } },
    })

    await expect(listProjects()).resolves.toEqual([projectListItem])
    expect(http.get).toHaveBeenCalledExactlyOnceWith('/api/projects')
  })

  it('creates a project with the supplied payload', async () => {
    const payload: CreateProjectPayload = {
      name: 'Launch plan',
      description: null,
    }
    vi.mocked(http.post).mockResolvedValue({ data: { code: 201, data: project } })

    await expect(createProject(payload)).resolves.toEqual(project)
    expect(http.post).toHaveBeenCalledExactlyOnceWith('/api/projects', payload)
  })

  it('joins a project with only the invite code in the request body', async () => {
    const payload: JoinProjectPayload = {
      projectId: 11,
      invite_code: 'JOIN42',
    }
    vi.mocked(http.post).mockResolvedValue({ data: { code: 200, data: membership } })

    await expect(joinProject(payload)).resolves.toEqual(membership)
    expect(http.post).toHaveBeenCalledExactlyOnceWith('/api/projects/11/join', {
      invite_code: 'JOIN42',
    })
  })

  it('gets a project by id', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { code: 200, data: project } })

    await expect(getProject(11)).resolves.toEqual(project)
    expect(http.get).toHaveBeenCalledExactlyOnceWith('/api/projects/11')
  })

  it('lists project members and unwraps the items collection', async () => {
    vi.mocked(http.get).mockResolvedValue({
      data: { code: 200, data: { items: [projectMember] } },
    })

    await expect(listProjectMembers(11)).resolves.toEqual([projectMember])
    expect(http.get).toHaveBeenCalledExactlyOnceWith('/api/projects/11/members')
  })

  it.each([
    ['100 ASCII project-name code points', { ...projectListItem, name: 'n'.repeat(100) }],
    [
      '100 supplementary project-name code points',
      { ...projectListItem, name: supplementaryCharacter.repeat(100) },
    ],
    ['500 ASCII description code points', { ...projectListItem, description: 'd'.repeat(500) }],
    [
      '500 supplementary description code points',
      { ...projectListItem, description: supplementaryCharacter.repeat(500) },
    ],
    [
      '4 supplementary invite-code code points',
      { ...projectListItem, invite_code: supplementaryCharacter.repeat(4) },
    ],
    [
      '12 supplementary invite-code code points',
      { ...projectListItem, invite_code: supplementaryCharacter.repeat(12) },
    ],
  ])('accepts %s', async (_case, item) => {
    vi.mocked(http.get).mockResolvedValue({ data: { code: 200, data: { items: [item] } } })

    await expect(listProjects()).resolves.toEqual([item])
  })

  it.each([
    [
      '101 supplementary project-name code points',
      { ...projectListItem, name: supplementaryCharacter.repeat(101) },
    ],
    [
      '501 supplementary description code points',
      { ...projectListItem, description: supplementaryCharacter.repeat(501) },
    ],
    [
      '3 supplementary invite-code code points',
      { ...projectListItem, invite_code: supplementaryCharacter.repeat(3) },
    ],
    [
      '13 supplementary invite-code code points',
      { ...projectListItem, invite_code: supplementaryCharacter.repeat(13) },
    ],
  ])('rejects %s', async (_case, item) => {
    vi.mocked(http.get).mockResolvedValue({ data: { code: 200, data: { items: [item] } } })

    await expect(listProjects()).rejects.toBeInstanceOf(ApiProtocolError)
  })

  it.each([
    ['missing list data', { code: 200, data: null }],
    ['missing items', { code: 200, data: {} }],
    ['non-array items', { code: 200, data: { items: projectListItem } }],
    ['invalid project id', { code: 200, data: { items: [{ ...projectListItem, id: 0 }] } }],
    ['invalid owner id', { code: 200, data: { items: [{ ...projectListItem, owner_id: 1.5 }] } }],
    ['unknown role', { code: 200, data: { items: [{ ...projectListItem, role: 'viewer' }] } }],
    ['empty name', { code: 200, data: { items: [{ ...projectListItem, name: ' ' }] } }],
    ['overlong name', { code: 200, data: { items: [{ ...projectListItem, name: 'n'.repeat(101) }] } }],
    [
      'overlong description',
      { code: 200, data: { items: [{ ...projectListItem, description: 'd'.repeat(501) }] } },
    ],
    ['empty invite code', { code: 200, data: { items: [{ ...projectListItem, invite_code: '' }] } }],
    ['short invite code', { code: 200, data: { items: [{ ...projectListItem, invite_code: 'abc' }] } }],
    [
      'overlong invite code',
      { code: 200, data: { items: [{ ...projectListItem, invite_code: 'a'.repeat(13) }] } },
    ],
    ['empty creation timestamp', { code: 200, data: { items: [{ ...projectListItem, created_at: '' }] } }],
    ['non-string creation timestamp', { code: 200, data: { items: [{ ...projectListItem, created_at: 7 }] } }],
  ])('rejects a project list with %s', async (_case, body) => {
    vi.mocked(http.get).mockResolvedValue({ data: body })

    await expect(listProjects()).rejects.toBeInstanceOf(ApiProtocolError)
  })

  it.each([
    ['primitive project', { code: 200, data: 11 }],
    ['missing field', { code: 200, data: { ...project, invite_code: undefined } }],
    ['non-string description', { code: 200, data: { ...project, description: 7 } }],
  ])('rejects project detail with %s', async (_case, body) => {
    vi.mocked(http.get).mockResolvedValue({ data: body })

    await expect(getProject(11)).rejects.toBeInstanceOf(ApiProtocolError)
  })

  it.each([
    ['missing member items', { code: 200, data: {} }],
    ['invalid user id', { code: 200, data: { items: [{ ...projectMember, user_id: -1 }] } }],
    ['empty username', { code: 200, data: { items: [{ ...projectMember, username: '' }] } }],
    ['empty email', { code: 200, data: { items: [{ ...projectMember, email: ' ' }] } }],
    ['unknown role', { code: 200, data: { items: [{ ...projectMember, role: 'guest' }] } }],
  ])('rejects project members with %s', async (_case, body) => {
    vi.mocked(http.get).mockResolvedValue({ data: body })

    await expect(listProjectMembers(11)).rejects.toBeInstanceOf(ApiProtocolError)
  })

  it.each([
    ['invalid project id', { code: 200, data: { ...membership, project_id: 0 } }],
    ['invalid user id', { code: 200, data: { ...membership, user_id: Number.NaN } }],
    ['unknown role', { code: 200, data: { ...membership, role: 'viewer' } }],
  ])('rejects project membership with %s', async (_case, body) => {
    vi.mocked(http.post).mockResolvedValue({ data: body })

    await expect(joinProject({ projectId: 11, invite_code: 'JOIN42' })).rejects.toBeInstanceOf(
      ApiProtocolError,
    )
  })
})
