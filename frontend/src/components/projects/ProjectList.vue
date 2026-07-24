<script setup lang="ts">
import type { ApiError } from '@/types/auth'
import type { ProjectListItem, ProjectRole } from '@/types/project'

defineProps<{
  projects: ProjectListItem[]
  loading: boolean
  loaded: boolean
  error: ApiError | null
}>()

const emit = defineEmits<{
  select: [projectId: number]
  retry: []
  create: []
  join: []
}>()

const roleLabels: Record<ProjectRole, string> = {
  owner: '负责人',
  admin: '管理员',
  member: '成员',
}

function formatCreatedDate(value: string): string {
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value)
  return match?.[0] ?? '日期未知'
}
</script>

<template>
  <section
    class="project-list"
    aria-labelledby="project-list-title"
  >
    <div class="project-list__heading">
      <h2 id="project-list-title">
        我的项目
      </h2>
      <span
        class="project-list__count"
        data-testid="project-count"
      >
        {{ projects.length }} 个项目
      </span>
    </div>

    <div
      v-if="loading && !loaded"
      class="project-list__loading"
      role="status"
      aria-live="polite"
    >
      <span>正在加载项目</span>
      <ul
        class="project-list__placeholders"
        aria-hidden="true"
      >
        <li
          v-for="index in 3"
          :key="index"
          class="project-list__placeholder"
          data-testid="project-placeholder"
        >
          <span />
          <span />
        </li>
      </ul>
    </div>

    <div
      v-else-if="error && !loaded"
      class="project-list__state"
    >
      <p role="alert">
        无法加载项目，请稍后重试。
      </p>
      <el-button
        data-testid="project-retry"
        native-type="button"
        @click="emit('retry')"
      >
        重试
      </el-button>
    </div>

    <div
      v-else-if="loaded && projects.length === 0"
      class="project-list__state project-list__state--empty"
    >
      <div>
        <h3>还没有项目</h3>
        <p>创建自己的项目，或使用项目 ID 和邀请码加入团队。</p>
      </div>
      <div class="project-list__empty-actions">
        <el-button
          data-testid="empty-join"
          native-type="button"
          @click="emit('join')"
        >
          加入项目
        </el-button>
        <el-button
          data-testid="empty-create"
          type="primary"
          native-type="button"
          @click="emit('create')"
        >
          新建项目
        </el-button>
      </div>
    </div>

    <template v-else>
      <p
        v-if="error"
        class="project-list__refresh-error"
        data-testid="refresh-error"
        role="alert"
      >
        刷新项目失败，当前显示上次加载的结果。
      </p>
      <p
        v-if="loading"
        class="project-list__refreshing"
        role="status"
      >
        正在刷新项目
      </p>
      <ul class="project-list__items">
        <li
          v-for="project in projects"
          :key="project.id"
          class="project-list__item"
          data-testid="project-item"
        >
          <button
            class="project-list__entry"
            type="button"
            :aria-label="`打开项目：${project.name}`"
            :aria-describedby="`project-${project.id}-description project-${project.id}-role project-${project.id}-created-at`"
            @click="emit('select', project.id)"
          >
            <span class="project-list__content">
              <span class="project-list__name">{{ project.name }}</span>
              <span
                :id="`project-${project.id}-description`"
                class="project-list__description"
              >
                {{ project.description || '暂无描述' }}
              </span>
            </span>
            <span class="project-list__meta">
              <span
                :id="`project-${project.id}-role`"
                class="project-list__role"
              >{{ roleLabels[project.role] }}</span>
              <span :id="`project-${project.id}-created-at`">创建于 {{ formatCreatedDate(project.created_at) }}</span>
            </span>
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.project-list {
  width: 100%;
}

.project-list__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.project-list__heading h2 {
  margin: 0;
  color: var(--tf-text);
  font-size: 19px;
  line-height: 1.35;
}

.project-list__count {
  flex: 0 0 auto;
  color: var(--tf-text-muted);
  font-size: 13px;
}

.project-list__loading > span,
.project-list__refreshing {
  display: block;
  margin: 0 0 10px;
  color: var(--tf-text-muted);
  font-size: 13px;
}

.project-list__placeholders,
.project-list__items {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.project-list__placeholder {
  display: grid;
  min-height: 88px;
  align-content: center;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid var(--tf-border);
  border-radius: 6px;
  background: #ffffff;
}

.project-list__placeholder span {
  display: block;
  width: min(48%, 260px);
  height: 12px;
  border-radius: 3px;
  background: #e8ebe9;
}

.project-list__placeholder span:last-child {
  width: min(72%, 440px);
  background: #f0f2f1;
}

.project-list__state {
  display: flex;
  min-height: 132px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 0;
  border-top: 1px solid var(--tf-border);
  border-bottom: 1px solid var(--tf-border);
}

.project-list__state p,
.project-list__state h3 {
  margin: 0;
}

.project-list__state p {
  color: var(--tf-text-muted);
  font-size: 14px;
  line-height: 1.6;
}

.project-list__state--empty h3 {
  margin-bottom: 6px;
  color: var(--tf-text);
  font-size: 16px;
}

.project-list__empty-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.project-list__empty-actions :deep(.el-button) {
  margin: 0;
  white-space: nowrap;
}

.project-list__refresh-error {
  margin: 0 0 10px;
  color: #a94435;
  font-size: 13px;
  line-height: 1.5;
}

.project-list__item {
  min-width: 0;
}

.project-list__entry {
  display: grid;
  width: 100%;
  min-height: 92px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 24px;
  padding: 16px 18px;
  border: 1px solid var(--tf-border);
  border-radius: 6px;
  color: inherit;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
}

.project-list__entry:hover {
  border-color: #9ab8b4;
  background: #fbfdfc;
}

.project-list__content,
.project-list__meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.project-list__content {
  gap: 6px;
}

.project-list__name {
  color: var(--tf-text);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.project-list__description {
  display: -webkit-box;
  overflow: hidden;
  color: var(--tf-text-muted);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.project-list__meta {
  align-items: flex-end;
  gap: 7px;
  max-width: 220px;
  color: var(--tf-text-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
  text-align: right;
  white-space: nowrap;
}

.project-list__role {
  color: #29635d;
  font-weight: 700;
}

@media (max-width: 640px) {
  .project-list__state {
    align-items: stretch;
    flex-direction: column;
    gap: 16px;
  }

  .project-list__empty-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .project-list__empty-actions :deep(.el-button) {
    width: 100%;
  }

  .project-list__entry {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .project-list__meta {
    align-items: flex-start;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px 14px;
    max-width: none;
    text-align: left;
    white-space: normal;
  }
}
</style>
