<script setup lang="ts">
import AuthForm from '@/components/AuthForm.vue'
import '@/styles/main.css'
</script>

<template>
  <main class="login-page">
    <aside
      class="login-brand"
      aria-labelledby="brand-title"
    >
      <div class="login-brand__content">
        <p
          class="login-brand__mark"
          aria-hidden="true"
        >
          TF
        </p>
        <h1 id="brand-title">
          TeamFlow
        </h1>
        <p class="login-brand__tagline">
          工作，自然流动
        </p>
        <p class="login-brand__support">
          让团队围绕同一节奏，清楚推进每一项工作。
        </p>

        <section
          class="workflow-board"
          aria-labelledby="workflow-title"
        >
          <h2 id="workflow-title">
            工作流一览
          </h2>
          <section class="workflow-column workflow-column--todo">
            <h3>待开始</h3>
            <div class="workflow-bar workflow-bar--long" />
            <div class="workflow-bar workflow-bar--short" />
            <div class="workflow-bar workflow-bar--medium" />
          </section>
          <section class="workflow-column workflow-column--doing">
            <h3>进行中</h3>
            <div class="workflow-bar workflow-bar--medium" />
            <div class="workflow-bar workflow-bar--long" />
            <div class="workflow-bar workflow-bar--short" />
          </section>
          <section class="workflow-column workflow-column--done">
            <h3>已完成</h3>
            <div class="workflow-bar workflow-bar--short" />
            <div class="workflow-bar workflow-bar--medium" />
            <div class="workflow-bar workflow-bar--long" />
          </section>
        </section>
      </div>
    </aside>

    <section
      class="login-access"
      aria-labelledby="auth-title"
    >
      <div class="login-access__content">
        <header class="login-access__header">
          <p class="login-access__eyebrow">
            团队账号
          </p>
          <h2 id="auth-title">
            欢迎回来
          </h2>
          <p>登录或注册，继续进入你的工作区。</p>
        </header>
        <AuthForm />
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(420px, 0.92fr);
  min-height: 100vh;
  background: var(--tf-surface);
}

.login-brand,
.login-access {
  display: flex;
  min-width: 0;
}

.login-brand {
  align-items: center;
  color: #f8f7f4;
  background: #202326;
  padding: clamp(40px, 6vw, 88px);
}

.login-brand__content {
  width: min(100%, 680px);
  margin: auto;
}

.login-brand__mark {
  display: grid;
  width: 40px;
  height: 40px;
  margin: 0 0 32px;
  place-items: center;
  border: 1px solid #4ca69b;
  border-radius: 6px;
  color: #78c9bf;
  font-size: 13px;
  font-weight: 750;
}

.login-brand h1 {
  margin: 0;
  color: #ffffff;
  font-size: clamp(44px, 6vw, 72px);
  line-height: 1;
  letter-spacing: 0;
}

.login-brand__tagline {
  margin: 22px 0 0;
  color: #ff8f7d;
  font-size: 24px;
  font-weight: 650;
  line-height: 1.35;
}

.login-brand__support {
  max-width: 520px;
  margin: 14px 0 0;
  color: #c9ccca;
  font-size: 16px;
  line-height: 1.75;
}

.workflow-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  margin-top: 64px;
}

.workflow-board > h2 {
  grid-column: 1 / -1;
  margin: 0 0 2px;
  color: #aeb3b1;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.4;
}

.workflow-column {
  min-width: 0;
  min-height: 184px;
  padding: 16px;
  border: 1px solid #414649;
  border-top: 3px solid #777f82;
  border-radius: 6px;
  background: #292d30;
}

.workflow-column--doing {
  border-top-color: #ff806e;
}

.workflow-column--done {
  border-top-color: #55b9ad;
}

.workflow-column h3 {
  margin: 0 0 22px;
  color: #e9eae8;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
}

.workflow-bar {
  height: 9px;
  margin-top: 14px;
  border-radius: 3px;
  background: #636a6d;
}

.workflow-column--doing .workflow-bar {
  background: #9b5d53;
}

.workflow-column--done .workflow-bar {
  background: #477f79;
}

.workflow-bar--short {
  width: 48%;
}

.workflow-bar--medium {
  width: 70%;
}

.workflow-bar--long {
  width: 92%;
}

.login-access {
  align-items: center;
  justify-content: center;
  padding: 48px clamp(32px, 6vw, 84px);
  background: #fbfaf7;
}

.login-access__content {
  width: min(100%, 410px);
}

.login-access__header {
  margin-bottom: 30px;
}

.login-access__eyebrow {
  margin: 0 0 8px;
  color: #327f77;
  font-size: 13px;
  font-weight: 700;
}

.login-access h2 {
  margin: 0;
  color: var(--tf-text);
  font-size: 30px;
  line-height: 1.25;
}

.login-access__header > p:last-child {
  margin: 10px 0 0;
  color: var(--tf-text-muted);
  font-size: 15px;
  line-height: 1.6;
}

@media (max-width: 760px) {
  .login-page {
    grid-template-columns: minmax(0, 1fr);
  }

  .login-brand {
    padding: 28px 24px 32px;
  }

  .login-brand__content {
    width: 100%;
  }

  .login-brand__mark {
    width: 34px;
    height: 34px;
    margin-bottom: 20px;
  }

  .login-brand h1 {
    font-size: 40px;
  }

  .login-brand__tagline {
    margin-top: 14px;
    font-size: 20px;
  }

  .login-brand__support {
    margin-top: 8px;
    font-size: 14px;
  }

  .workflow-board {
    display: none;
  }

  .login-access {
    align-items: flex-start;
    min-height: 520px;
    padding: 38px 24px 48px;
  }

  .login-access__content {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-page *,
  .login-page *::before,
  .login-page *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
