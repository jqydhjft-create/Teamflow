import type { Pinia } from 'pinia'
import type { RouterHistory } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
  }
}

const DEFAULT_REDIRECT = '/dashboard'
const PROTOCOL_LIKE_PATH = /^\/[A-Za-z][A-Za-z\d+.-]*:/

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1F || codePoint === 0x7F
  })
}

export function resolveSafeRedirect(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || !value.startsWith('/')
    || value.startsWith('//')
    || value.includes('\\')
    || containsControlCharacter(value)
    || PROTOCOL_LIKE_PATH.test(value)
  ) {
    return DEFAULT_REDIRECT
  }

  const pathname = value.split(/[?#]/, 1)[0]
  return pathname === '/login' ? DEFAULT_REDIRECT : value
}

export function createAppRouter(pinia: Pinia, history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes: [
      {
        path: '/login',
        name: 'login',
        component: () => import('@/views/LoginView.vue'),
      },
      {
        path: '/dashboard',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: '/project/:id',
        name: 'project-board',
        component: () => import('@/views/ProjectBoardView.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: '/:pathMatch(.*)*',
        redirect: '/dashboard',
      },
    ],
  })

  router.beforeEach(async (to) => {
    const auth = useAuthStore(pinia)
    await auth.restoreSession()

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return {
        path: '/login',
        query: { redirect: to.fullPath },
      }
    }

    if (to.name === 'login' && auth.isAuthenticated) {
      return resolveSafeRedirect(to.query.redirect)
    }

    return true
  })

  return router
}
