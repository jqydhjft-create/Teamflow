import type {
  CreateProjectPayload,
  JoinProjectPayload,
  Project,
  ProjectListItem,
  ProjectMember,
  ProjectMembership,
  ProjectRole,
} from '@/types/project'

import {
  decodeEnvelope,
  decodeNonEmptyString,
  decodeNullableString,
  decodePositiveInteger,
  isObject,
} from './decoders'
import { ApiProtocolError } from './errors'
import { http } from './http'

function decodeBoundedNonEmptyString(value: unknown, maximumLength: number): string {
  const decoded = decodeNonEmptyString(value)

  if (Array.from(decoded).length > maximumLength) {
    throw new ApiProtocolError()
  }

  return decoded
}

function decodeDescription(value: unknown): string | null {
  const decoded = decodeNullableString(value)

  if (decoded !== null && Array.from(decoded).length > 500) {
    throw new ApiProtocolError()
  }

  return decoded
}

function decodeInviteCode(value: unknown): string {
  const decoded = decodeNonEmptyString(value)

  const length = Array.from(decoded).length

  if (length < 4 || length > 12) {
    throw new ApiProtocolError()
  }

  return decoded
}

function decodeProjectRole(value: unknown): ProjectRole {
  if (value !== 'owner' && value !== 'admin' && value !== 'member') {
    throw new ApiProtocolError()
  }

  return value
}

function decodeProject(value: unknown): Project {
  if (!isObject(value)) {
    throw new ApiProtocolError()
  }

  return {
    id: decodePositiveInteger(value.id),
    name: decodeBoundedNonEmptyString(value.name, 100),
    description: decodeDescription(value.description),
    owner_id: decodePositiveInteger(value.owner_id),
    invite_code: decodeInviteCode(value.invite_code),
    created_at: decodeNonEmptyString(value.created_at),
  }
}

function decodeProjectListItem(value: unknown): ProjectListItem {
  if (!isObject(value)) {
    throw new ApiProtocolError()
  }

  return {
    ...decodeProject(value),
    role: decodeProjectRole(value.role),
  }
}

function decodeProjectMember(value: unknown): ProjectMember {
  if (!isObject(value)) {
    throw new ApiProtocolError()
  }

  return {
    user_id: decodePositiveInteger(value.user_id),
    username: decodeNonEmptyString(value.username),
    email: decodeNonEmptyString(value.email),
    role: decodeProjectRole(value.role),
  }
}

function decodeProjectMembership(value: unknown): ProjectMembership {
  if (!isObject(value)) {
    throw new ApiProtocolError()
  }

  return {
    project_id: decodePositiveInteger(value.project_id),
    user_id: decodePositiveInteger(value.user_id),
    role: decodeProjectRole(value.role),
  }
}

function decodeItems<T>(value: unknown, decodeItem: (item: unknown) => T): T[] {
  if (!isObject(value) || !Array.isArray(value.items)) {
    throw new ApiProtocolError()
  }

  return value.items.map(decodeItem)
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const response = await http.get<unknown>('/api/projects')

  return decodeEnvelope(response.data, (data) => decodeItems(data, decodeProjectListItem))
}

export async function createProject(payload: CreateProjectPayload): Promise<Project> {
  const response = await http.post<unknown>('/api/projects', payload)

  return decodeEnvelope(response.data, decodeProject)
}

export async function joinProject(payload: JoinProjectPayload): Promise<ProjectMembership> {
  const response = await http.post<unknown>(`/api/projects/${payload.projectId}/join`, {
    invite_code: payload.invite_code,
  })

  return decodeEnvelope(response.data, decodeProjectMembership)
}

export async function getProject(projectId: number): Promise<Project> {
  const response = await http.get<unknown>(`/api/projects/${projectId}`)

  return decodeEnvelope(response.data, decodeProject)
}

export async function listProjectMembers(projectId: number): Promise<ProjectMember[]> {
  const response = await http.get<unknown>(`/api/projects/${projectId}/members`)

  return decodeEnvelope(response.data, (data) => decodeItems(data, decodeProjectMember))
}
