const TOKEN_KEY = 'teamflow.access_token'
const TOKEN_STORAGE_WRITE_FAILED = 'TOKEN_STORAGE_WRITE_FAILED'
let sessionEpoch = 0

export function readSessionEpoch(): number {
  return sessionEpoch
}

export function advanceSessionEpoch(): number {
  sessionEpoch += 1
  return sessionEpoch
}

export class TokenStorageError extends Error {
  readonly code = TOKEN_STORAGE_WRITE_FAILED

  constructor(cause: unknown) {
    super(TOKEN_STORAGE_WRITE_FAILED, { cause })
    this.name = 'TokenStorageError'
  }
}

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch (error) {
    throw new TokenStorageError(error)
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Clearing credentials is best-effort when browser storage is unavailable.
  }
}
