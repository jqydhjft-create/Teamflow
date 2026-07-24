import type { ApiResponse, AuthData, LoginPayload, RegisterPayload, User } from '@/types/auth'

import {
  decodeEnvelope,
  decodeNonEmptyString,
  decodePositiveInteger,
  isObject,
} from './decoders'
import { ApiProtocolError } from './errors'
import { http } from './http'

function decodeUser(value: unknown): User {
  if (!isObject(value)) {
    throw new ApiProtocolError()
  }

  return {
    id: decodePositiveInteger(value.id),
    username: decodeNonEmptyString(value.username),
    email: decodeNonEmptyString(value.email),
    created_at: decodeNonEmptyString(value.created_at),
  }
}

function decodeAuthData(value: unknown): AuthData {
  if (!isObject(value)) {
    throw new ApiProtocolError()
  }

  return {
    user: decodeUser(value.user),
    token: decodeNonEmptyString(value.token),
  }
}

export async function register(payload: RegisterPayload): Promise<AuthData> {
  const response = await http.post<unknown>('/api/auth/register', payload, {
    skipAuthRedirect: true,
  })

  return decodeEnvelope(response.data, decodeAuthData)
}

export async function login(payload: LoginPayload): Promise<AuthData> {
  const response = await http.post<unknown>('/api/auth/login', payload, {
    skipAuthRedirect: true,
  })

  return decodeEnvelope(response.data, decodeAuthData)
}

export async function getCurrentUser(): Promise<User> {
  const response = await http.get<unknown>('/api/auth/me')

  return decodeEnvelope(response.data, decodeUser)
}

export async function logout(): Promise<void> {
  await http.post<ApiResponse<unknown>>('/api/auth/logout')
}
