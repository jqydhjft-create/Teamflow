<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { initialized } = storeToRefs(auth)
</script>

<template>
  <main
    v-if="!initialized"
    class="app-loading"
    aria-busy="true"
  >
    <p role="status">
      正在恢复登录状态
    </p>
  </main>
  <RouterView v-else />
</template>

<style scoped>
.app-loading {
  display: grid;
  min-height: 100vh;
  place-items: center;
  color: var(--tf-text-muted);
}

.app-loading p {
  margin: 0;
}
</style>
