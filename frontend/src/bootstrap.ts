import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElTooltip,
} from 'element-plus'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-input-number.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-option.css'
import 'element-plus/theme-chalk/el-tooltip.css'
import { createPinia, type Pinia } from 'pinia'
import { createApp, type App as VueApp, type Component } from 'vue'
import { isNavigationFailure, type Router } from 'vue-router'

import App from '@/App.vue'
import { setUnauthorizedHandler } from '@/api/http'
import { readSessionEpoch } from '@/api/token'
import { createAppRouter, resolveSafeRedirect } from '@/router'
import { useAuthStore } from '@/stores/auth'

type AuthStore = ReturnType<typeof useAuthStore>
type HardRedirect = (path: string) => void
type Reload = () => void

const ACCESS_TOKEN_STORAGE_KEY = 'teamflow.access_token'

let activeUnauthorizedInstallation: symbol | null = null

function defaultHardRedirect(path: string): void {
  window.location.assign(path)
}

function defaultReload(): void {
  window.location.reload()
}

export function installUnauthorizedHandler(
  auth: AuthStore,
  router: Router,
  hardRedirect: HardRedirect = defaultHardRedirect,
): () => void {
  const installation = Symbol('unauthorized-handler')
  let disposed = false
  let redirectInFlight: Promise<unknown> | null = null

  activeUnauthorizedInstallation = installation

  function redirectOutsideRouter(): void {
    try {
      hardRedirect('/login')
    } catch (error) {
      console.error('Unauthorized hard redirect failed', error)
    }
  }

  setUnauthorizedHandler((context) => {
    if (
      disposed
      || activeUnauthorizedInstallation !== installation
      || context.token !== auth.token
      || context.epoch !== readSessionEpoch()
    ) {
      return
    }

    auth.clearSession()

    if (router.currentRoute.value.path === '/login' || redirectInFlight) {
      return
    }

    const redirect = resolveSafeRedirect(router.currentRoute.value.fullPath)

    try {
      redirectInFlight = router
        .replace({ path: '/login', query: { redirect } })
        .then((failure) => {
          if (isNavigationFailure(failure) || router.currentRoute.value.path !== '/login') {
            redirectOutsideRouter()
          }
        })
        .catch((error: unknown) => {
          console.error('Unauthorized redirect failed', error)
          redirectOutsideRouter()
        })
        .finally(() => {
          redirectInFlight = null
        })
    } catch (error) {
      console.error('Unauthorized redirect failed', error)
      redirectOutsideRouter()
    }
  })

  return () => {
    if (disposed) {
      return
    }

    disposed = true
    redirectInFlight = null

    if (activeUnauthorizedInstallation === installation) {
      activeUnauthorizedInstallation = null
      setUnauthorizedHandler(null)
    }
  }
}

export interface BootstrapDependencies {
  createPinia: () => Pinia
  createRouter: (pinia: Pinia) => Router
  createVueApp: (root: Component) => VueApp
  getAuthStore: (pinia: Pinia) => AuthStore
  installUnauthorized: (auth: AuthStore, router: Router) => () => void
  reload: Reload
}

const defaultDependencies: BootstrapDependencies = {
  createPinia,
  createRouter: createAppRouter,
  createVueApp: createApp,
  getAuthStore: useAuthStore,
  installUnauthorized: installUnauthorizedHandler,
  reload: defaultReload,
}

export function createBootstrap(overrides: Partial<BootstrapDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides }
  const pinia = dependencies.createPinia()
  const router = dependencies.createRouter(pinia)
  const app = dependencies.createVueApp(App)
  const auth = dependencies.getAuthStore(pinia)
  const cleanupUnauthorized = dependencies.installUnauthorized(auth, router)
  let disposed = false
  let mounted = false

  function handleStorage(event: StorageEvent): void {
    if (
      event.key === ACCESS_TOKEN_STORAGE_KEY
      && event.oldValue !== event.newValue
    ) {
      dependencies.reload()
    }
  }

  window.addEventListener('storage', handleStorage)

  app.component(ElButton.name!, ElButton)
  app.component(ElForm.name!, ElForm)
  app.component(ElFormItem.name!, ElFormItem)
  app.component(ElInput.name!, ElInput)
  app.component(ElDialog.name!, ElDialog)
  app.component(ElInputNumber.name!, ElInputNumber)
  app.component(ElSelect.name!, ElSelect)
  app.component(ElOption.name!, ElOption)
  app.component(ElTooltip.name!, ElTooltip)
  app.use(pinia)
  app.use(router)

  return {
    mount(target: string | Element = '#app') {
      const instance = app.mount(target)
      mounted = true
      return instance
    },
    dispose(): void {
      if (disposed) {
        return
      }

      disposed = true
      cleanupUnauthorized()
      window.removeEventListener('storage', handleStorage)
      if (mounted) {
        app.unmount()
      }
    },
  }
}
