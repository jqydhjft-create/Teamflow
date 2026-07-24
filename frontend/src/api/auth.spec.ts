import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthData, LoginPayload, RegisterPayload, User } from '@/types/auth'

import { getCurrentUser, login, logout, register } from './auth'
import {
  decodeEnvelope,
  decodeNonEmptyString,
  decodeNullableString,
  decodePositiveInteger,
  isObject,
} from './decoders'
import { ApiProtocolError } from './errors'
import { http } from './http'

vi.mock('./http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const user: User = {
  id: 7,
  username: 'alice',
  email: 'alice@example.com',
  created_at: '2026-07-24T08:00:00Z',
}

const authData: AuthData = {
  user,
  token: 'header.payload.signature',
}

describe('shared API decoders', () => {
  it('recognizes non-array objects', () => {
    expect(isObject({})).toBe(true)
    expect(isObject([])).toBe(false)
    expect(isObject(null)).toBe(false)
  })

  it.each([1, 42, Number.MAX_SAFE_INTEGER])('decodes the positive integer %s', (value) => {
    expect(decodePositiveInteger(value)).toBe(value)
  })

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.MAX_SAFE_INTEGER + 1,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '1',
  ])('rejects %s as a positive integer', (value) => {
    expect(() => decodePositiveInteger(value)).toThrow(ApiProtocolError)
  })

  it('decodes non-empty and nullable strings', () => {
    expect(decodeNonEmptyString('value')).toBe('value')
    expect(decodeNullableString('')).toBe('')
    expect(decodeNullableString(null)).toBeNull()
  })

  it.each(['', '   ', null, 7])('rejects %s as a non-empty string', (value) => {
    expect(() => decodeNonEmptyString(value)).toThrow(ApiProtocolError)
  })

  it.each([undefined, 7, {}])('rejects %s as a nullable string', (value) => {
    expect(() => decodeNullableString(value)).toThrow(ApiProtocolError)
  })

  it('decodes an envelope with an optional string message', () => {
    expect(decodeEnvelope({ code: 200, data: 'value' }, decodeNonEmptyString)).toBe('value')
    expect(decodeEnvelope({ code: 200, message: 'OK', data: 'value' }, decodeNonEmptyString)).toBe(
      'value',
    )
  })

  it.each([
    null,
    [],
    { code: Number.POSITIVE_INFINITY, data: 'value' },
    { code: 200, message: 7, data: 'value' },
    { code: 200, message: undefined, data: 'value' },
    { code: 200 },
    Object.assign(Object.create({ data: 'value' }) as object, { code: 200 }),
  ])('rejects malformed envelope %#', (value) => {
    expect(() => decodeEnvelope(value, decodeNonEmptyString)).toThrow(ApiProtocolError)
  })
})

describe('auth API', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('registers without triggering the global auth redirect and unwraps auth data', async () => {
    const payload: RegisterPayload = {
      username: 'alice',
      email: 'alice@example.com',
      password: 'correct horse battery staple',
    }
    vi.mocked(http.post).mockResolvedValue({
      data: { code: 201, message: 'Registered', data: authData },
    })

    await expect(register(payload)).resolves.toEqual(authData)
    expect(http.post).toHaveBeenCalledExactlyOnceWith('/api/auth/register', payload, {
      skipAuthRedirect: true,
    })
  })

  it('logs in without triggering the global auth redirect and unwraps auth data', async () => {
    const payload: LoginPayload = {
      username_or_email: 'alice@example.com',
      password: 'correct horse battery staple',
    }
    vi.mocked(http.post).mockResolvedValue({
      data: { code: 200, message: 'Logged in', data: authData },
    })

    await expect(login(payload)).resolves.toEqual(authData)
    expect(http.post).toHaveBeenCalledExactlyOnceWith('/api/auth/login', payload, {
      skipAuthRedirect: true,
    })
  })

  it('gets the current user and unwraps a response with no message', async () => {
    vi.mocked(http.get).mockResolvedValue({
      data: { code: 200, data: user },
    })

    await expect(getCurrentUser()).resolves.toEqual(user)
    expect(http.get).toHaveBeenCalledExactlyOnceWith('/api/auth/me')
  })

  it('rejects an envelope whose data only exists on the prototype', async () => {
    const body = Object.assign(Object.create({ data: user }) as object, { code: 200 })
    vi.mocked(http.get).mockResolvedValue({ data: body })

    await expect(getCurrentUser()).rejects.toBeInstanceOf(ApiProtocolError)
  })

  it('logs out without inventing a revocation result', async () => {
    vi.mocked(http.post).mockResolvedValue({
      data: { code: 200, message: 'Logged out', data: null },
    })

    await expect(logout()).resolves.toBeUndefined()
    expect(http.post).toHaveBeenCalledExactlyOnceWith('/api/auth/logout')
  })

  it.each([
    ['null response body', null],
    ['primitive response body', 'ok'],
    ['missing data', { code: 200 }],
    ['malformed envelope code', { code: '200', data: authData }],
    ['null auth data', { code: 200, data: null }],
    ['missing auth user', { code: 200, data: { token: authData.token } }],
    ['malformed token', { code: 200, data: { user, token: '' } }],
    ['non-integer user id', { code: 200, data: { user: { ...user, id: 1.5 }, token: authData.token } }],
    ['non-positive user id', { code: 200, data: { user: { ...user, id: 0 }, token: authData.token } }],
    ['empty username', { code: 200, data: { user: { ...user, username: '' }, token: authData.token } }],
    ['empty email', { code: 200, data: { user: { ...user, email: '' }, token: authData.token } }],
    [
      'empty creation timestamp',
      { code: 200, data: { user: { ...user, created_at: '' }, token: authData.token } },
    ],
  ])('rejects register success with %s as a protocol error', async (_case, body) => {
    vi.mocked(http.post).mockResolvedValue({ data: body })

    await expect(register({ username: 'alice', email: 'alice@example.com', password: 'secret' }))
      .rejects.toBeInstanceOf(ApiProtocolError)
  })

  it('validates login success data with the shared auth decoder', async () => {
    vi.mocked(http.post).mockResolvedValue({
      data: { code: 200, data: { user, token: '   ' } },
    })

    await expect(login({ username_or_email: 'alice', password: 'secret' })).rejects.toMatchObject({
      name: 'ApiProtocolError',
      code: 'protocol_error',
      message: '服务响应格式异常，请稍后重试。',
    })
  })

  it.each([
    ['null response body', null],
    ['missing data', { code: 200 }],
    ['primitive user data', { code: 200, data: 7 }],
    ['malformed user', { code: 200, data: { ...user, email: ' ' } }],
  ])('rejects current-user success with %s as a protocol error', async (_case, body) => {
    vi.mocked(http.get).mockResolvedValue({ data: body })

    await expect(getCurrentUser()).rejects.toBeInstanceOf(ApiProtocolError)
  })

  it('resets queued mock implementations between tests', async () => {
    vi.mocked(http.post).mockResolvedValueOnce({ data: { code: 200, data: authData } })

    await expect(login({ username_or_email: 'alice', password: 'secret' })).resolves.toEqual(authData)
    expect(http.post).toHaveBeenCalledOnce()
  })
})
