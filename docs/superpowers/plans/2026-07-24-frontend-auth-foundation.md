# TeamFlow Frontend Authentication Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vue 3 frontend in `frontend/` that supports registration, login, current-user restoration, protected routing, and client-side logout against the existing TeamFlow FastAPI API.

**Architecture:** Use a lightweight domain split: views call a Pinia setup store, the store calls a typed auth API, and the auth API uses one configured Axios client. Router guards own navigation policy, while the store owns authentication state and persistence. The phase ends at a protected Dashboard shell; project and Kanban data stay out of scope.

**Tech Stack:** Vue 3, Vite, TypeScript, Vue Router, Pinia, Element Plus, Axios, Vitest, Vue Test Utils, jsdom, ESLint, pnpm.

---

## File Map

- `frontend/package.json`: scripts and dependency manifest.
- `frontend/vite.config.ts`: Vue plugin, `@` alias, and Vitest configuration.
- `frontend/eslint.config.js`: Vue and TypeScript lint rules.
- `frontend/tsconfig*.json`: application and build-tool type checking.
- `frontend/.env.example`: documented backend base URL.
- `frontend/src/types/auth.ts`: API response, user, credential, and error types.
- `frontend/src/api/token.ts`: the only localStorage token boundary.
- `frontend/src/api/http.ts`: Axios instance, bearer injection, and global unauthorized callback.
- `frontend/src/api/errors.ts`: stable conversion from Axios/backend failures to `ApiError`.
- `frontend/src/api/auth.ts`: typed wrappers for the four existing auth endpoints.
- `frontend/src/stores/auth.ts`: current authentication state and actions.
- `frontend/src/router/index.ts`: routes, safe redirect parsing, and auth guard.
- `frontend/src/components/AuthForm.vue`: login/register form behavior and validation.
- `frontend/src/views/LoginView.vue`: confirmed split authentication composition.
- `frontend/src/views/DashboardView.vue`: protected application shell.
- `frontend/src/App.vue`: router outlet and application initialization state.
- `frontend/src/main.ts`: Vue, Pinia, Router, and Element Plus bootstrap.
- `frontend/src/styles/main.css`: visual tokens, responsive split layout, and dashboard shell styling.
- `frontend/src/**/*.spec.ts`: colocated unit and component tests.
- `frontend/tests/setup.ts`: jsdom and Element Plus test setup.
- `README.md`: frontend setup, validation commands, and known logout limitation.

## Task 1: Scaffold and Test Harness

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.app.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/eslint.config.js`
- Create: `frontend/.env.example`
- Create: `frontend/src/env.d.ts`
- Create: `frontend/tests/setup.ts`
- Create: `frontend/src/smoke.spec.ts`

- [ ] **Step 1: Create the package and TypeScript configuration**

Define scripts exactly as follows:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "vue-tsc -b",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Use Vue 3, Router 4, Pinia, Element Plus, Axios, Vite, `@vitejs/plugin-vue`, TypeScript, `vue-tsc`, Vitest, Vue Test Utils, jsdom, ESLint, `typescript-eslint`, and `eslint-plugin-vue`. Set `type: module` and `packageManager` to the installed pnpm major version.

- [ ] **Step 2: Add the minimal failing smoke test**

```ts
import { describe, expect, it } from 'vitest'

describe('frontend test harness', () => {
  it('runs in jsdom', () => {
    expect(window.localStorage).toBeDefined()
  })
})
```

- [ ] **Step 3: Install and verify the harness**

Run: `cd D:\TeamFlow\frontend; pnpm install`

Run: `pnpm test`

Expected: one smoke test passes in the jsdom environment.

- [ ] **Step 4: Verify configuration quality**

Run: `pnpm lint; pnpm typecheck`

Expected: both commands exit `0` before feature code is introduced.

Because the repository is not a valid Git repository, record Task 1 files in the stage report instead of attempting a commit.

## Task 2: Token Storage and HTTP Client

**Files:**
- Create: `frontend/src/api/token.ts`
- Create: `frontend/src/api/token.spec.ts`
- Create: `frontend/src/api/http.ts`
- Create: `frontend/src/api/http.spec.ts`

- [ ] **Step 1: Write failing token storage tests**

Test that `readToken()` returns `null` initially, `writeToken('jwt')` persists the exact value, and `clearToken()` removes it. Reset localStorage in `beforeEach`.

```ts
expect(readToken()).toBeNull()
writeToken('jwt')
expect(readToken()).toBe('jwt')
clearToken()
expect(readToken()).toBeNull()
```

- [ ] **Step 2: Run the token tests and verify RED**

Run: `pnpm test -- src/api/token.spec.ts`

Expected: FAIL because `src/api/token.ts` does not exist.

- [ ] **Step 3: Implement the storage boundary**

Use the key `teamflow.access_token` and export `readToken`, `writeToken`, and `clearToken`. Do not expose localStorage access elsewhere.

- [ ] **Step 4: Run the token tests and verify GREEN**

Run: `pnpm test -- src/api/token.spec.ts`

Expected: all token tests pass.

- [ ] **Step 5: Write failing HTTP interceptor tests**

Use a custom Axios adapter to inspect outgoing headers without network traffic. Assert that requests include `Authorization: Bearer jwt` only when storage contains a token. Also register an unauthorized callback, return a synthetic `401`, and assert that the callback runs once.

```ts
setUnauthorizedHandler(onUnauthorized)
writeToken('jwt')
await http.get('/protected', { adapter })
expect(seenAuthorization).toBe('Bearer jwt')
```

- [ ] **Step 6: Run the HTTP tests and verify RED**

Run: `pnpm test -- src/api/http.spec.ts`

Expected: FAIL because the client and callback registration do not exist.

- [ ] **Step 7: Implement the Axios client**

Create the instance with `baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'` and a 10-second timeout. Add the Bearer request interceptor. Add a response interceptor that invokes the registered callback for `401` responses, except when request config contains the private marker `skipAuthRedirect: true`; augment Axios config typing for that marker.

- [ ] **Step 8: Run the HTTP tests and verify GREEN**

Run: `pnpm test -- src/api/http.spec.ts`

Expected: Bearer and unauthorized-handler tests pass.

## Task 3: Typed Auth API and Error Normalization

**Files:**
- Create: `frontend/src/types/auth.ts`
- Create: `frontend/src/api/errors.ts`
- Create: `frontend/src/api/errors.spec.ts`
- Create: `frontend/src/api/auth.ts`
- Create: `frontend/src/api/auth.spec.ts`

- [ ] **Step 1: Define tests for backend error shapes**

Cover `401` HTTP errors, `409` conflicts, `422` validation details, network errors, and unknown values. The stable result is:

```ts
interface ApiError {
  status: number | null
  code: string
  message: string
  details: unknown[]
}
```

Assert that a backend `{ code: 'http_error', message: 'Invalid credentials' }` retains its message and status, while a request without response becomes `{ status: null, code: 'network_error', message: '无法连接服务器，请稍后重试。' }`.

- [ ] **Step 2: Run error tests and verify RED**

Run: `pnpm test -- src/api/errors.spec.ts`

Expected: FAIL because `toApiError` is missing.

- [ ] **Step 3: Implement `toApiError`**

Use `axios.isAxiosError`, inspect `response?.data`, preserve validation `details` only when it is an array, and return a neutral fallback for unknown errors.

- [ ] **Step 4: Run error tests and verify GREEN**

Run: `pnpm test -- src/api/errors.spec.ts`

Expected: all normalization cases pass.

- [ ] **Step 5: Write failing auth API tests**

Mock only the shared Axios instance. Assert exact methods, paths, payloads, and response unwrapping:

```ts
expect(http.post).toHaveBeenCalledWith('/api/auth/login', credentials, {
  skipAuthRedirect: true,
})
expect(await getCurrentUser()).toEqual(user)
```

Test `/api/auth/me` with `{ code: 0, data: user }` and no `message`.

- [ ] **Step 6: Run auth API tests and verify RED**

Run: `pnpm test -- src/api/auth.spec.ts`

Expected: FAIL because the endpoint wrappers are missing.

- [ ] **Step 7: Implement typed endpoint wrappers**

Define `User`, `LoginPayload`, `RegisterPayload`, `AuthData`, and `ApiResponse<T>` in `types/auth.ts`; make `ApiResponse.message` optional. Implement exact existing backend endpoints and set `skipAuthRedirect` on login/register so credential errors stay local to the form.

- [ ] **Step 8: Run auth API tests and verify GREEN**

Run: `pnpm test -- src/api/auth.spec.ts`

Expected: all endpoint and unwrapping tests pass.

## Task 4: Pinia Authentication Store

**Files:**
- Create: `frontend/src/stores/auth.ts`
- Create: `frontend/src/stores/auth.spec.ts`

- [ ] **Step 1: Write the failing login and registration tests**

Create a fresh Pinia for every test. Mock the auth API and token functions. Assert that successful login and registration set `token`, set `user`, persist the token, and produce `isAuthenticated === true`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm test -- src/stores/auth.spec.ts`

Expected: FAIL because `useAuthStore` does not exist.

- [ ] **Step 3: Implement minimal successful actions**

Use a setup store with `ref<User | null>`, `ref<string | null>`, `ref(false)` for initialization, and a computed `isAuthenticated` requiring both token and user. `login` and `register` call the API and one private `setSession` helper.

- [ ] **Step 4: Verify successful actions are GREEN**

Run: `pnpm test -- src/stores/auth.spec.ts`

Expected: login and registration cases pass.

- [ ] **Step 5: Add failing session restoration and logout tests**

Cover no stored token, valid stored token, rejected `/me`, successful logout, and rejected logout. Assert `initialized` always becomes true and rejected restoration/logout always clears memory plus localStorage.

- [ ] **Step 6: Run tests and verify RED for new behavior**

Run: `pnpm test -- src/stores/auth.spec.ts`

Expected: restoration/logout cases fail because the actions are incomplete.

- [ ] **Step 7: Implement restoration, clearing, and logout**

`restoreSession()` must be idempotent after initialization. Read the stored token, call `/me` only when present, clear invalid state in `catch`, and set `initialized` in `finally`. `logout()` attempts the API only when a token exists and clears the session in `finally`.

- [ ] **Step 8: Verify the complete store**

Run: `pnpm test -- src/stores/auth.spec.ts`

Expected: all store tests pass.

## Task 5: Router and Authentication Guard

**Files:**
- Create: `frontend/src/router/index.ts`
- Create: `frontend/src/router/index.spec.ts`
- Create: `frontend/src/views/LoginView.vue`
- Create: `frontend/src/views/DashboardView.vue`

- [ ] **Step 1: Write failing safe-redirect tests**

Export `resolveSafeRedirect(value)` and assert that `/dashboard`, `/project/1`, and a single query-string value are accepted, while `https://example.com`, `//example.com`, empty strings, and arrays resolve to `/dashboard`.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test -- src/router/index.spec.ts`

Expected: FAIL because router helpers do not exist.

- [ ] **Step 3: Implement safe redirect and route records**

Create `/login`, `/dashboard` with `meta.requiresAuth = true`, and a catch-all redirect to `/dashboard`. Keep initial view components minimal and semantic so routing can compile before visual work.

- [ ] **Step 4: Write failing guard behavior tests**

With memory history, assert:

```ts
await router.push('/dashboard')
expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/dashboard')
```

Also assert `restoreSession()` runs before the decision, authenticated `/login` redirects to a safe destination, and an external redirect query is rejected.

- [ ] **Step 5: Run and verify RED for guard behavior**

Run: `pnpm test -- src/router/index.spec.ts`

Expected: guard cases fail before the guard is registered.

- [ ] **Step 6: Implement the guard**

Export a `createAppRouter(pinia, history?)` factory for testability. In `beforeEach`, await restoration once through the store, enforce `requiresAuth`, and redirect authenticated users away from `/login`.

- [ ] **Step 7: Verify router GREEN**

Run: `pnpm test -- src/router/index.spec.ts`

Expected: safe redirect and guard tests pass without navigation loops.

## Task 6: Authentication Form

**Files:**
- Create: `frontend/src/components/AuthForm.vue`
- Create: `frontend/src/components/AuthForm.spec.ts`

- [ ] **Step 1: Write failing mode and validation tests**

Mount with Pinia and Router. Assert login initially shows identity and password fields, registration adds username/email/confirmation, invalid values do not call the store, and mismatched passwords show the Chinese validation message.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test -- src/components/AuthForm.spec.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement mode switching and Element Plus rules**

Use a segmented control implemented with two semantic buttons and `aria-pressed`. Use `ElForm`, `ElFormItem`, `ElInput`, and `ElButton`; define TypeScript form models and rules matching backend limits. Keep text letter spacing at `0` and use Element Plus password visibility support.

- [ ] **Step 4: Verify validation GREEN**

Run: `pnpm test -- src/components/AuthForm.spec.ts`

Expected: mode and validation tests pass.

- [ ] **Step 5: Add failing submission tests**

Assert exact store payloads, loading disables repeated submission, successful submission uses the safe redirect, `401` shows `用户名、邮箱或密码不正确。`, `409` shows `用户名或邮箱已存在。`, and network errors use the normalized message without clearing fields.

- [ ] **Step 6: Run and verify RED for submission behavior**

Run: `pnpm test -- src/components/AuthForm.spec.ts`

Expected: submission and error cases fail before handlers are complete.

- [ ] **Step 7: Implement submission behavior**

Use one guarded async submit function with `submitting` and `formError`. Call store `login` or `register`, catch and normalize errors, then `router.replace(resolveSafeRedirect(route.query.redirect))` on success.

- [ ] **Step 8: Verify full form GREEN**

Run: `pnpm test -- src/components/AuthForm.spec.ts`

Expected: all form tests pass.

## Task 7: Confirmed Split Login View and Dashboard Shell

**Files:**
- Modify: `frontend/src/views/LoginView.vue`
- Modify: `frontend/src/views/DashboardView.vue`
- Create: `frontend/src/views/LoginView.spec.ts`
- Create: `frontend/src/views/DashboardView.spec.ts`
- Create: `frontend/src/styles/main.css`

- [ ] **Step 1: Write failing composition tests**

Assert the login view renders the TeamFlow brand, Kanban-inspired three-column motif, product line, and `AuthForm`. Assert the Dashboard renders the authenticated username and a logout button.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test -- src/views/LoginView.spec.ts src/views/DashboardView.spec.ts`

Expected: FAIL because the minimal route views lack the confirmed UI.

- [ ] **Step 3: Implement the split view and responsive styles**

Use an unframed two-column page at desktop widths and stack below `760px`. Keep form width constrained, cards at no more than `8px` radius, stable field/button dimensions, no gradients, no decorative blobs, and no nested cards. Preserve visible focus states and support `prefers-reduced-motion`.

- [ ] **Step 4: Implement the Dashboard shell**

Render a compact top bar with TeamFlow, the current username, and an icon-plus-text logout command. The content area contains a truthful empty-stage heading for the upcoming project workspace, not fabricated metrics or projects. Await store logout, navigate to `/login`, and keep the button disabled while running.

- [ ] **Step 5: Run view tests and verify GREEN**

Run: `pnpm test -- src/views/LoginView.spec.ts src/views/DashboardView.spec.ts`

Expected: all view composition and logout tests pass.

## Task 8: Application Bootstrap and Global Unauthorized Flow

**Files:**
- Create: `frontend/src/App.vue`
- Create: `frontend/src/App.spec.ts`
- Create: `frontend/src/main.ts`
- Modify: `frontend/src/api/http.ts`

- [ ] **Step 1: Write the failing application-state test**

Assert `App.vue` shows a stable loading region with `aria-busy="true"` before initialization and the router outlet after initialization.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test -- src/App.spec.ts`

Expected: FAIL because the root application is missing.

- [ ] **Step 3: Implement bootstrap and unauthorized callback**

Create Pinia before the router, register both with Vue, import Element Plus CSS and `styles/main.css`, then mount. Register the Axios unauthorized handler to call `auth.clearSession()` and replace the current route with `/login?redirect=<safe current path>` when not already on `/login`.

- [ ] **Step 4: Verify application tests and type safety**

Run: `pnpm test -- src/App.spec.ts src/api/http.spec.ts`

Run: `pnpm typecheck`

Expected: application-state tests pass and TypeScript exits `0`.

## Task 9: Documentation and Full Verification

**Files:**
- Modify: `D:\TeamFlow\README.md`
- Delete: `frontend/src/smoke.spec.ts` after real coverage exists

- [ ] **Step 1: Update operational documentation**

Add commands for `pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Document copying `.env.example` to `.env.local`, the default API URL, this phase's route scope, and the fact that logout only removes the client Token.

- [ ] **Step 2: Run all frontend checks independently**

Run:

```powershell
cd D:\TeamFlow\frontend
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: every command exits `0`; Vitest reports no failed tests and Vite produces `frontend/dist/`.

- [ ] **Step 3: Run the backend regression suite**

Run: `cd D:\TeamFlow; python -m pytest tests -v`

Expected: all 28 existing backend tests pass.

- [ ] **Step 4: Start local services for browser verification**

Start FastAPI at `http://127.0.0.1:8000` and Vite on an unused port, using hidden background processes. Record both process IDs and URLs. Do not reuse an occupied port.

- [ ] **Step 5: Verify desktop and mobile flows in the browser**

At approximately `1440x900` and `390x844`, verify login/register switching, field validation, a real registration or login, Dashboard protection, refresh restoration, and logout. Capture screenshots and inspect for clipped text, overlaps, horizontal scrolling, layout shift, console errors, and failed asset requests.

- [ ] **Step 6: Record final stage report**

List every created/modified file, exact command results, browser URLs, screenshots, and remaining risks. Explicitly report that no Git commit exists because `D:\TeamFlow\.git` is not a valid repository.

## Plan Self-Review

- Spec coverage: scaffold, Router, Pinia, Axios, registration, login, `/me`, protected Dashboard, client logout, confirmed split UI, errors, tests, docs, and browser QA each map to a task.
- Scope: project list, project CRUD, Kanban, SortableJS, ECharts, Docker frontend packaging, and backend changes are excluded.
- Type consistency: `User`, payloads, `ApiResponse<T>`, `ApiError`, auth actions, `resolveSafeRedirect`, and `skipAuthRedirect` use the same names throughout.
- Placeholder scan: the plan contains no unresolved implementation placeholders; references to the backend logout placeholder describe existing behavior.
- Version-control exception: all commit steps are replaced by stage reports because Git commands cannot work in the current repository state.
