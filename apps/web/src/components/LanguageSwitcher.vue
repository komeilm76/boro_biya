<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSessionStore } from '../stores/session.js';
import { useI18n } from 'vue-i18n';
import { applyDocumentDirection, type SupportedLocale } from '../i18n/index.js';
const { locale } = useI18n();
const session = useSessionStore();
const busy = ref(false);
const failed = ref(false);
function apply(value: SupportedLocale) {
  locale.value = value;
  applyDocumentDirection(value);
  try {
    localStorage.setItem('boro-locale', value);
  } catch {
    /* Storage may be disabled. */
  }
}
watch(
  () => (session.isAuthenticated ? session.preferredLocale : undefined),
  (value) => {
    if (value) apply(value);
  },
  { immediate: true },
);
async function choose(value: SupportedLocale) {
  if (busy.value) return;
  failed.value = false;
  if (!session.isAuthenticated) {
    apply(value);
    return;
  }
  busy.value = true;
  try {
    if (await session.saveLocale(value)) apply(value);
  } catch {
    failed.value = true;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <nav :aria-label="$t('auth.language')" class="flex gap-3 p-4">
    <v-btn :disabled="busy" lang="en" :aria-pressed="locale === 'en'" @click="choose('en')">{{
      $t('auth.english')
    }}</v-btn>
    <v-btn :disabled="busy" lang="fa" :aria-pressed="locale === 'fa'" @click="choose('fa')">{{
      $t('auth.persian')
    }}</v-btn>
    <p v-if="failed" role="alert">{{ $t('auth.localeSaveFailed') }}</p>
  </nav>
</template>
