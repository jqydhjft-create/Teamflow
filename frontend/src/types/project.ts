export type ProjectRole = 'owner' | 'admin' | 'member'

export interface Project {
  id: number
  name: string
  description: string | null
  owner_id: number
  invite_code: string
  created_at: string
}

export interface ProjectListItem extends Project {
  role: ProjectRole
}

export interface ProjectMember {
  user_id: number
  username: string
  email: string
  role: ProjectRole
}

export interface ProjectMembership {
  project_id: number
  user_id: number
  role: ProjectRole
}

export interface CreateProjectPayload {
  name: string
  description: string | null
}

export interface JoinProjectPayload {
  projectId: number
  invite_code: string
}
