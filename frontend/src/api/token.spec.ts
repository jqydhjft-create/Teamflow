import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  advanceSessionEpoch,
  clearToken,
  readSessionEpoch,
  readToken,
  TokenStorageError,
  writeToken,
} from './token'

const TOKEN_KEY = 'teamflow.access_token'

describe('token storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when no token has been stored', () => {
    expect(readToken()).toBeNull()
  })

  it('advances the in-memory session epoch monotonically', () => {
    const initial = readSessionEpoch()

    const first = advanceSessionEpoch()
    const second = advanceSessionEpoch()

    expect(first).toBe(initial + 1)
    expect(second).toBe(first + 1)
    expect(readSessionEpoch()).toBe(second)
  })

  it('persists and reads the exact token value', () => {
    writeToken('header.payload.signature')

    expect(localStorage.getItem(TOKEN_KEY)).toBe('header.payload.signature')
    expect(readToken()).toBe('header.payload.signature')
  })

  it('removes the stored token', () => {
    localStorage.setItem(TOKEN_KEY, 'token-to-remove')

    clearToken()

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(readToken()).toBeNull()
  })

  it('returns null when localStorage access throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('storage unavailable')
      },
    })

    try {
      expect(readToken()).toBeNull()
    } finally {
      if (descriptor) {
        Object.defineProperty(window, 'localStorage', descriptor)
      }
    }
  })

  it('returns null when reading from localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('read denied')
    })

    expect(readToken()).toBeNull()
  })

  it('throws a stable TokenStorageError with the original cause when writing fails', () => {
    const cause = new Error('quota exceeded')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw cause
    })

    expect(() => writeToken('unsaved-token')).toThrowError(
      expect.objectContaining({
        cause,
        code: 'TOKEN_STORAGE_WRITE_FAILED',
        message: 'TOKEN_STORAGE_WRITE_FAILED',
        name: 'TokenStorageError',
      }),
    )

    try {
      writeToken('unsaved-token')
    } catch (error) {
      expect(error).toBeInstanceOf(TokenStorageError)
    }
  })

  it('does not throw when removing from localStorage fails', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('remove denied')
    })

    expect(() => clearToken()).not.toThrow()
  })
})
