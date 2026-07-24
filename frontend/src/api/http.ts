import axios, { type AxiosError } from 'axios'

import { readSessionEpoch, readToken } from './token'

declare module 'axios' {
  interface AxiosRequestConfig {
    authEpochSnapshot?: number
    authTokenSnapshot?: string | null
    skipAuthRedirect?: boolean
  }
}

export interface UnauthorizedContext {
  readonly epoch: number
  readonly token: string | null
}

type UnauthorizedHandler = (context: UnauthorizedContext) => void

let unauthorizedHandler: UnauthorizedHandler | null = null

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  timeout: 10_000,
})

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

http.interceptors.request.use((config) => {
  const token = readToken()
  config.authEpochSnapshot = readSessionEpoch()
  config.authTokenSnapshot = token

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !error.config?.skipAuthRedirect) {
      try {
      unauthorizedHandler?.(Object.freeze({
        epoch: error.config?.authEpochSnapshot ?? readSessionEpoch(),
        token: error.config?.authTokenSnapshot ?? null,
      }))
      } catch (handlerError) {
        console.error('Unauthorized handler failed', handlerError)
      }
    }

    return Promise.reject(error)
  },
)
