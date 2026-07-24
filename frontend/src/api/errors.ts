import axios from 'axios'

import type { ApiError } from '@/types/auth'

const NETWORK_MESSAGE = '无法连接服务器，请稍后重试。'
const UNKNOWN_MESSAGE = '发生未知错误，请稍后重试。'
const HTTP_MESSAGE = '请求失败，请稍后重试。'
const PROTOCOL_MESSAGE = '服务响应格式异常，请稍后重试。'

export class ApiProtocolError extends Error {
  readonly code = 'protocol_error'

  constructor() {
    super(PROTOCOL_MESSAGE)
    this.name = 'ApiProtocolError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function toApiError(value: unknown): ApiError {
  if (value instanceof ApiProtocolError) {
    return {
      status: null,
      code: value.code,
      message: value.message,
      details: [],
    }
  }

  if (axios.isCancel(value)) {
    return {
      status: null,
      code: 'request_canceled',
      message: '请求已取消。',
      details: [],
    }
  }

  if (!axios.isAxiosError(value)) {
    return {
      status: null,
      code: 'unknown_error',
      message: UNKNOWN_MESSAGE,
      details: [],
    }
  }

  if (!value.response) {
    return {
      status: null,
      code: 'network_error',
      message: NETWORK_MESSAGE,
      details: [],
    }
  }

  const body = isRecord(value.response.data) ? value.response.data : {}

  return {
    status: value.response.status,
    code: typeof body.code === 'string' && body.code ? body.code : 'http_error',
    message: typeof body.message === 'string' && body.message ? body.message : HTTP_MESSAGE,
    details: Array.isArray(body.details) ? body.details : [],
  }
}
