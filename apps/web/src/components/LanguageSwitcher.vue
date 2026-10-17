<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { applyDocumentDirection, type SupportedLocale } from '../i18n/index.js';
const { locale } = useI18n();
function choose(value: SupportedLocale) {
  locale.value = value;
  applyDocumentDirection(value);
  try {
    localStorage.setItem('boro-locale', value);
  } catch {
    /* Storage may be disabled. */
  }
}
</script>
<template>
  <nav :aria-label="$t('auth.language')" class="flex gap-3 p-4">
    <v-btn lang="en" :aria-pressed="locale === 'en'" @click="choose('en')">{{ $t('auth.english') }}</v-btn>
    <v-btn lang="fa" :aria-pressed="locale === 'fa'" @click="choose('fa')">{{ $t('auth.persian') }}</v-btn>
  </nav>
</template>
