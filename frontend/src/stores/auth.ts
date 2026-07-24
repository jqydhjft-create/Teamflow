import { computed, ref } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'

import type { AuthData, LoginPayload, RegisterPayload, User } from '@/types/auth'

import { getCurrentUser, login as requestLogin, logout as requestLogout, register as requestRegister } from '@/api/auth'
import { advanceSessionEpoch, clearToken, readToken, writeToken } from '@/api/token'
import { useBoardStore } from '@/stores/board'
import { useProjectsStore } from '@/stores/projects'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const user = ref<User | null>(null)
  const initialized = ref(false)
  const isAuthenticated = computed(() => token.value !== null && user.value !== null)

  let currentTicket = 0
  let restorePromise: Promise<void> | null = null
  let logoutOperation: { promise: Promise<void>, ticket: number } | null = null

  function claimTicket(): number {
    advanceSessionEpoch()
    useProjectsStore().reset()
    useBoardStore().reset()
    currentTicket += 1
    return currentTicket
  }

  function clearSessionFor(ticket: number): void {
    if (ticket !== currentTicket) {
      return
    }

    token.value = null
    user.value = null

    try {
      clearToken()
    } catch {
      // Token removal is best-effort, including for mocked or alternate storage adapters.
    }
  }

  function clearSession(): void {
    clearSessionFor(claimTicket())
  }

  function setSession(data: AuthData, ticket: number): void {
    if (ticket !== currentTicket) {
      return
    }

    try {
      writeToken(data.token)
    } catch (error) {
      clearSessionFor(ticket)
      throw error
    }

    token.value = data.token
    user.value = data.user
  }

  async function login(payload: LoginPayload): Promise<AuthData> {
    const ticket = claimTicket()
    const data = await requestLogin(payload)
    setSession(data, ticket)
    return data
  }

  async function register(payload: RegisterPayload): Promise<AuthData> {
    const ticket = claimTicket()
    const data = await requestRegister(payload)
    setSession(data, ticket)
    return data
  }

  function restoreSession(): Promise<void> {
    if (initialized.value) {
      return Promise.resolve()
    }

    if (restorePromise) {
      return restorePromise
    }

    const ticket = claimTicket()
    const operation = Promise.resolve().then(async () => {
      try {
        const storedToken = readToken()
        if (storedToken === null) {
          clearSessionFor(ticket)
          return
        }

        if (ticket === currentTicket) {
          token.value = storedToken
          user.value = null
        }

        const restoredUser = await getCurrentUser()
        if (ticket === currentTicket) {
          user.value = restoredUser
        }
      } catch {
        clearSessionFor(ticket)
      } finally {
        initialized.value = true
        if (restorePromise === operation) {
          restorePromise = null
        }
      }
    })

    restorePromise = operation
    return operation
  }

  function logout(): Promise<void> {
    if (logoutOperation?.ticket === currentTicket) {
      return logoutOperation.promise
    }

    const tokenSnapshot = token.value
    const ticket = claimTicket()
    const operation = Promise.resolve().then(async () => {
      try {
        if (tokenSnapshot !== null) {
          await requestLogout()
        }
      } finally {
        clearSessionFor(ticket)
        if (logoutOperation?.promise === operation) {
          logoutOperation = null
        }
      }
    })

    logoutOperation = { promise: operation, ticket }
    return operation
  }

  return {
    clearSession,
    initialized,
    isAuthenticated,
    login,
    logout,
    register,
    restoreSession,
    token,
    user,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot))
}
