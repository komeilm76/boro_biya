<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import LocalizedTime from './LocalizedTime.vue';
import { useSessionStore } from '../stores/session.js';
import { startSecurityStream, type SecurityNotice } from '../security-stream.js';
const session = useSessionStore(),
  notices = ref<SecurityNotice[]>([]),
  connected = ref(false);
let stop: (() => void) | undefined;
const visible = computed(() =>
  notices.value.filter(
    (notice) =>
      !session.securityNotices?.some((saved) => saved.event === notice.event && saved.createdAt === notice.createdAt),
  ),
);
watch(
  [() => session.isAuthenticated, () => session.accessToken, () => session.authVersion, () => session.userId],
  () => {
    stop?.();
    stop = undefined;
    notices.value = [];
    connected.value = false;
    if (!session.isAuthenticated || !session.accessToken) return;
    stop = startSecurityStream(
      () => session.issueSecurityStreamTicket(),
      (notice) => {
        notices.value = [...notices.value.filter((item) => item.id !== notice.id), notice].slice(-10);
      },
      (value) => {
        connected.value = value;
      },
    );
  },
  { immediate: true, flush: 'sync' },
);
onUnmounted(() => {
  stop?.();
  notices.value = [];
});
</script>
<template>
  <section v-if="session.isAuthenticated" :aria-label="$t('securityStream.label')">
    <p v-if="!connected" role="status">{{ $t('securityStream.unavailable') }}</p>
    <aside v-for="notice in visible" :key="notice.id" role="status" class="my-4">
      {{ $t(`securityNotices.${notice.event}`) }} <LocalizedTime :value="notice.createdAt" />
    </aside>
  </section>
</template>
