<script setup lang="ts">
import { Plus, SwitchButton, UserFilled } from '@element-plus/icons-vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import ProjectDialog from '@/components/projects/ProjectDialog.vue'
import ProjectList from '@/components/projects/ProjectList.vue'
import { useAuthStore } from '@/stores/auth'
import { useProjectsStore } from '@/stores/projects'
import '@/styles/main.css'

const auth = useAuthStore()
const projectsStore = useProjectsStore()
const router = useRouter()
const loggingOut = ref(false)
const projectNavigationError = ref('')
const logoutNavigationError = ref('')
const createDialogOpen = ref(false)
const joinDialogOpen = ref(false)
const currentUser = computed(() => auth.user?.username || auth.user?.email || '当前用户')
let projectNavigationTicket = 0

onMounted(() => {
  void projectsStore.loadProjects()
})

function openCreateDialog(): void {
  projectNavigationError.value = ''
  createDialogOpen.value = true
}

function openJoinDialog(): void {
  projectNavigationError.value = ''
  joinDialogOpen.value = true
}

function retryProjects(): void {
  void projectsStore.loadProjects({ force: true })
}

async function openProject(projectId: number): Promise<void> {
  if (loggingOut.value) {
    return
  }

  const ticket = ++projectNavigationTicket
  projectNavigationError.value = ''
  try {
    await router.push(`/project/${projectId}`)
  } catch {
    if (ticket === projectNavigationTicket && !loggingOut.value) {
      projectNavigationError.value = '无法打开项目，请重试。'
    }
  }
}

async function logout(): Promise<void> {
  if (loggingOut.value) {
    return
  }

  loggingOut.value = true
  projectNavigationTicket += 1
  projectNavigationError.value = ''
  logoutNavigationError.value = ''
  try {
    await auth.logout()
  } catch {
    // The store clears local session state even when the server cannot be reached.
  }

  try {
    await router.replace('/login')
  } catch {
    logoutNavigationError.value = '已退出登录，但页面跳转失败，请重试。'
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <div class="dashboard-shell">
    <header class="dashboard-header">
      <a
        class="dashboard-brand"
        href="/dashboard"
        aria-label="TeamFlow 首页"
      >
        <span
          class="dashboard-brand__mark"
          aria-hidden="true"
        >TF</span>
        <span>TeamFlow</span>
      </a>

      <div class="dashboard-account">
        <span data-testid="current-user">{{ currentUser }}</span>
        <div class="dashboard-actions">
          <button
            class="dashboard-logout"
            data-testid="logout-button"
            type="button"
            :disabled="loggingOut"
            :aria-busy="loggingOut"
            @click="logout"
          >
            <SwitchButton aria-hidden="true" />
            <span>{{ loggingOut ? '正在退出' : '退出登录' }}</span>
          </button>
          <p
            v-if="logoutNavigationError"
            class="dashboard-actions__error"
            data-testid="logout-navigation-error"
            role="alert"
          >
            {{ logoutNavigationError }}
          </p>
        </div>
      </div>
    </header>

    <main class="dashboard-main">
      <section
        class="dashboard-workspace"
        aria-labelledby="workspace-title"
      >
        <div class="dashboard-workspace__heading">
          <div>
            <p class="dashboard-workspace__eyebrow">
              工作空间
            </p>
            <h1 id="workspace-title">
              项目工作区
            </h1>
          </div>
          <div class="dashboard-workspace__actions">
            <el-button
              data-testid="open-join-dialog"
              native-type="button"
              @click="openJoinDialog"
            >
              <UserFilled aria-hidden="true" />
              加入项目
            </el-button>
            <el-button
              data-testid="open-create-dialog"
              type="primary"
              native-type="button"
              @click="openCreateDialog"
            >
              <Plus aria-hidden="true" />
              新建项目
            </el-button>
          </div>
        </div>

        <p
          v-if="projectNavigationError"
          class="dashboard-workspace__navigation-error"
          data-testid="project-navigation-error"
          role="alert"
        >
          {{ projectNavigationError }}
        </p>

        <ProjectList
          :projects="projectsStore.projects"
          :loading="projectsStore.loading"
          :loaded="projectsStore.loaded"
          :error="projectsStore.error"
          @select="openProject"
          @retry="retryProjects"
          @create="openCreateDialog"
          @join="openJoinDialog"
        />
      </section>
    </main>

    <ProjectDialog
      v-model="createDialogOpen"
      mode="create"
      @success="openProject"
    />
    <ProjectDialog
      v-model="joinDialogOpen"
      mode="join"
      @success="openProject"
    />
  </div>
</template>

<style scoped>
.dashboard-shell {
  min-width: 0;
  min-height: 100vh;
  overflow-x: clip;
  background: var(--tf-surface);
}

.dashboard-header {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 10px clamp(20px, 4vw, 56px);
  border-bottom: 1px solid var(--tf-border);
  background: #ffffff;
}

.dashboard-brand {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  color: var(--tf-text);
  font-size: 17px;
  font-weight: 750;
  text-decoration: none;
}

.dashboard-brand__mark {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 5px;
  color: #ffffff;
  background: #2f7770;
  font-size: 10px;
}

.dashboard-account {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 18px;
  color: var(--tf-text-muted);
  font-size: 14px;
}

.dashboard-account > span {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-actions {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 6px;
}

.dashboard-actions__error {
  max-width: 320px;
  margin: 0;
  color: #b84d3d;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.dashboard-logout {
  display: inline-flex;
  min-width: 112px;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 7px 12px;
  border: 1px solid #c8cdca;
  border-radius: 6px;
  color: #353a3b;
  background: #ffffff;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.dashboard-logout:hover:not(:disabled) {
  border-color: #d76452;
  color: #b84d3d;
  background: #fff8f6;
}

.dashboard-logout:disabled {
  cursor: wait;
  opacity: 0.62;
}

.dashboard-logout svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.dashboard-main {
  width: min(100% - 40px, 1040px);
  margin: 0 auto;
  padding: 40px 0 64px;
}

.dashboard-workspace__heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
  margin-bottom: 34px;
}

.dashboard-workspace__eyebrow {
  margin: 0 0 7px;
  color: #347c74;
  font-size: 12px;
  font-weight: 700;
}

.dashboard-workspace h1 {
  margin: 0;
  color: var(--tf-text);
  font-size: 30px;
  line-height: 1.25;
}

.dashboard-workspace__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.dashboard-workspace__actions :deep(.el-button) {
  min-width: 116px;
  margin: 0;
  white-space: nowrap;
}

.dashboard-workspace__actions svg {
  width: 16px;
  height: 16px;
}

.dashboard-workspace__navigation-error {
  margin: -18px 0 16px;
  color: #b84d3d;
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 700px) {
  .dashboard-header {
    align-items: flex-start;
    gap: 16px;
    padding: 14px 18px;
  }

  .dashboard-account {
    max-width: 150px;
    align-items: flex-end;
    flex-direction: column;
    gap: 8px;
  }

  .dashboard-actions__error {
    max-width: 150px;
    text-align: right;
  }

  .dashboard-account > span {
    max-width: 150px;
  }

  .dashboard-main {
    width: min(100% - 36px, 1040px);
    padding: 30px 0 48px;
  }

  .dashboard-workspace__heading {
    align-items: stretch;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 28px;
  }

  .dashboard-workspace h1 {
    font-size: 26px;
  }

  .dashboard-workspace__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-workspace__actions :deep(.el-button) {
    width: 100%;
    min-width: 0;
  }
}

@media (max-width: 390px) {
  .dashboard-header {
    gap: 10px;
    padding-inline: 14px;
  }

  .dashboard-brand {
    gap: 7px;
    font-size: 15px;
  }

  .dashboard-account {
    max-width: 132px;
  }

  .dashboard-account > span,
  .dashboard-actions__error {
    max-width: 132px;
  }
}
</style>
