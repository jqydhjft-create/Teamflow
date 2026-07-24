import { ApiProtocolError } from './errors'

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function decodePositiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new ApiProtocolError()
  }

  return value
}

export function decodeNonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiProtocolError()
  }

  return value
}

export function decodeNullableString(value: unknown): string | null {
  if (value !== null && typeof value !== 'string') {
    throw new ApiProtocolError()
  }

  return value
}

export function decodeEnvelope<T>(value: unknown, decodeData: (data: unknown) => T): T {
  if (
    !isObject(value) ||
    typeof value.code !== 'number' ||
    !Number.isFinite(value.code) ||
    ('message' in value && typeof value.message !== 'string') ||
    !Object.hasOwn(value, 'data')
  ) {
    throw new ApiProtocolError()
  }

  return decodeData(value.data)
}
