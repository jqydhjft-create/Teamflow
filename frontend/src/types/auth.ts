export interface User {
  id: number
  username: string
  email: string
  created_at: string
}

export interface LoginPayload {
  username_or_email: string
  password: string
}

export interface RegisterPayload {
  username: string
  email: string
  password: string
}

export interface AuthData {
  user: User
  token: string
}

export interface ApiResponse<T> {
  code: number
  message?: string
  data: T
}

export interface ApiError {
  status: number | null
  code: string
  message: string
  details: unknown[]
}
