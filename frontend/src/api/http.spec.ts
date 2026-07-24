import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { http, setUnauthorizedHandler } from './http'
import { advanceSessionEpoch, clearToken, readSessionEpoch, writeToken } from './token'

function responseFor(config: InternalAxiosRequestConfig, status = 200): AxiosResponse {
  return {
    config,
    data: null,
    headers: {},
    status,
    statusText: status === 401 ? 'Unauthorized' : 'OK',
  }
}

const unauthorizedAdapter: AxiosAdapter = async (config) => {
  const response = responseFor(config, 401)

  throw new AxiosError(
    'Request failed with status code 401',
    AxiosError.ERR_BAD_REQUEST,
    config,
    undefined,
    response,
  )
}

describe('http client', () => {
  beforeEach(() => {
    clearToken()
    setUnauthorizedHandler(null)
  })

  afterEach(() => {
    setUnauthorizedHandler(null)
    vi.restoreAllMocks()
  })

  it('uses the configured API defaults', () => {
    expect(http.defaults.baseURL).toBe(
      import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
    )
    expect(http.defaults.timeout).toBe(10_000)
  })

  it('does not set Authorization when there is no token', async () => {
    let authorization: unknown
    let tokenSnapshot: unknown
    let epochSnapshot: unknown
    const adapter: AxiosAdapter = async (config) => {
      authorization = config.headers.get('Authorization')
      tokenSnapshot = config.authTokenSnapshot
      epochSnapshot = config.authEpochSnapshot
      return responseFor(config)
    }

    await http.get('/protected', { adapter })

    expect(authorization).toBeUndefined()
    expect(tokenSnapshot).toBeNull()
    expect(epochSnapshot).toBe(readSessionEpoch())
  })

  it('sets the exact Bearer Authorization header when a token exists', async () => {
    writeToken('header.payload.signature')
    const epoch = advanceSessionEpoch()
    let authorization: unknown
    let tokenSnapshot: unknown
    let epochSnapshot: unknown
    const adapter: AxiosAdapter = async (config) => {
      authorization = config.headers.get('Authorization')
      tokenSnapshot = config.authTokenSnapshot
      epochSnapshot = config.authEpochSnapshot
      return responseFor(config)
    }

    await http.get('/protected', { adapter })

    expect(authorization).toBe('Bearer header.payload.signature')
    expect(tokenSnapshot).toBe('header.payload.signature')
    expect(epochSnapshot).toBe(epoch)
  })

  it('invokes the current unauthorized handler once for a 401', async () => {
    const handler = vi.fn()
    writeToken('jwt-A')
    const epoch = advanceSessionEpoch()
    setUnauthorizedHandler(handler)

    await expect(http.get('/protected', { adapter: unauthorizedAdapter })).rejects.toMatchObject({
      response: { status: 401 },
    })

    expect(handler).toHaveBeenCalledExactlyOnceWith({ epoch, token: 'jwt-A' })
  })

  it('does not invoke the unauthorized handler for an opted-out 401', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)

    await expect(
      http.get('/login', { adapter: unauthorizedAdapter, skipAuthRedirect: true }),
    ).rejects.toMatchObject({ response: { status: 401 } })

    expect(handler).not.toHaveBeenCalled()
  })

  it('keeps response errors rejected after handling', async () => {
    setUnauthorizedHandler(vi.fn())

    const request = http.get('/protected', { adapter: unauthorizedAdapter })

    await expect(request).rejects.toBeInstanceOf(AxiosError)
  })

  it('preserves the original AxiosError when the unauthorized handler throws', async () => {
    const handlerError = new Error('handler failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    setUnauthorizedHandler(() => {
      throw handlerError
    })

    let originalError: AxiosError | undefined
    const adapter: AxiosAdapter = async (config) => {
      const response = responseFor(config, 401)
      originalError = new AxiosError(
        'Request failed with status code 401',
        AxiosError.ERR_BAD_REQUEST,
        config,
        undefined,
        response,
      )
      throw originalError
    }

    const rejectedError = await http.get('/protected', { adapter }).catch((error: unknown) => error)

    expect(rejectedError).toBe(originalError)
    expect(consoleError).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith('Unauthorized handler failed', handlerError)
  })
})
