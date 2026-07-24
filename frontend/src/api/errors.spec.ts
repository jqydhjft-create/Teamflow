import {
  AxiosError,
  CanceledError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { describe, expect, it } from 'vitest'

import { ApiProtocolError, toApiError } from './errors'

function axiosResponse(status: number, data: unknown): AxiosResponse {
  return {
    config: {} as InternalAxiosRequestConfig,
    data,
    headers: {},
    status,
    statusText: '',
  }
}

function responseError(status: number, data: unknown): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_REQUEST,
    {} as InternalAxiosRequestConfig,
    undefined,
    axiosResponse(status, data),
  )
}

describe('toApiError', () => {
  it('preserves a 401 backend error code and message', () => {
    expect(
      toApiError(
        responseError(401, {
          code: 'http_error',
          message: '用户名或密码错误',
        }),
      ),
    ).toEqual({
      status: 401,
      code: 'http_error',
      message: '用户名或密码错误',
      details: [],
    })
  })

  it('preserves a 409 backend error code and message', () => {
    expect(
      toApiError(
        responseError(409, {
          code: 'http_error',
          message: '用户名或邮箱已存在',
        }),
      ),
    ).toEqual({
      status: 409,
      code: 'http_error',
      message: '用户名或邮箱已存在',
      details: [],
    })
  })

  it('preserves validation details only when they are an array', () => {
    const details = [{ loc: ['body', 'email'], msg: 'Invalid email', type: 'value_error' }]

    expect(
      toApiError(
        responseError(422, {
          code: 'validation_error',
          message: 'Request validation failed',
          details,
        }),
      ),
    ).toEqual({
      status: 422,
      code: 'validation_error',
      message: 'Request validation failed',
      details,
    })

    expect(
      toApiError(
        responseError(422, {
          code: 'validation_error',
          message: 'Request validation failed',
          details: { field: 'email' },
        }),
      ).details,
    ).toEqual([])
  })

  it('uses stable fallbacks for a malformed HTTP response body', () => {
    expect(toApiError(responseError(500, null))).toEqual({
      status: 500,
      code: 'http_error',
      message: '请求失败，请稍后重试。',
      details: [],
    })
  })

  it('normalizes a request with no response as a network error', () => {
    const error = new AxiosError(
      'Network Error',
      AxiosError.ERR_NETWORK,
      {} as InternalAxiosRequestConfig,
      {},
    )

    expect(toApiError(error)).toEqual({
      status: null,
      code: 'network_error',
      message: '无法连接服务器，请稍后重试。',
      details: [],
    })
  })

  it('normalizes Axios cancellation before the no-response fallback', () => {
    expect(toApiError(new CanceledError('canceled'))).toEqual({
      status: null,
      code: 'request_canceled',
      message: '请求已取消。',
      details: [],
    })
  })

  it('preserves the stable protocol error contract', () => {
    const error = new ApiProtocolError()

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ApiProtocolError')
    expect(toApiError(error)).toEqual({
      status: null,
      code: 'protocol_error',
      message: '服务响应格式异常，请稍后重试。',
      details: [],
    })
  })

  it('normalizes non-Axios values as unknown errors', () => {
    expect(toApiError(new Error('boom'))).toEqual({
      status: null,
      code: 'unknown_error',
      message: '发生未知错误，请稍后重试。',
      details: [],
    })
  })
})
